/**
 * GET  /conversations/:id            — full history (for resuming).
 * POST /conversations/:id/messages   — append user message, stream the
 *                                      assistant reply via SSE.
 *
 * The assistant call = persona system prompt + moment context (analysis + venue
 * + date) + the moment's images + full message history + the new user message.
 */

import type { FastifyInstance } from 'fastify';
import type { ConversationHistory, MomentAnalysis } from '@lookback/shared';
import { query } from '../db';
import { storage } from '../storage';
import { llm } from '../integrations/llm';
import { requireAuth } from '../auth';
import { toConversation, toMessage, toMoment, toPhotoRef } from '../serialize';

interface ConvRow {
  id: string;
  seed_id: string | null;
  created_at: string;
}

/** Resolve the moment behind a conversation (via its seed). */
async function momentForConversation(conv: ConvRow) {
  if (!conv.seed_id) return null;
  const res = await query(
    `select m.* from conversation_seeds s join moments m on m.id = s.moment_id
       where s.id = $1`,
    [conv.seed_id],
  );
  return res.rows[0] ?? null;
}

async function photoRowsForMoment(momentId: string) {
  const res = await query<{
    id: string;
    thumb_key: string | null;
    vision_key: string | null;
    taken_at: string | null;
  }>(
    `select p.id, p.thumb_key, p.vision_key, p.taken_at
       from moment_photos mp join photos p on p.id = mp.photo_id
       where mp.moment_id = $1 order by p.taken_at nulls last`,
    [momentId],
  );
  return res.rows;
}

export function conversationRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    '/conversations/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const convRes = await query<ConvRow>('select * from conversations where id = $1', [
        req.params.id,
      ]);
      if (convRes.rows.length === 0) return reply.code(404).send({ error: 'not found' });
      const convRow = convRes.rows[0]!;

      const msgRes = await query(
        'select * from messages where conversation_id = $1 order by created_at asc',
        [req.params.id],
      );
      const momentRow = await momentForConversation(convRow);
      const photos = momentRow
        ? await Promise.all((await photoRowsForMoment(momentRow.id)).map(toPhotoRef))
        : [];

      const payload: ConversationHistory = {
        conversation: toConversation(convRow as unknown as Record<string, unknown>),
        messages: msgRes.rows.map(toMessage),
        moment: momentRow ? toMoment(momentRow) : null,
        photos,
      };
      return reply.send(payload);
    },
  );

  app.post<{ Params: { id: string }; Body: { content: string } }>(
    '/conversations/:id/messages',
    { preHandler: requireAuth },
    async (req, reply) => {
      const conversationId = req.params.id;
      const content = (req.body?.content ?? '').trim();
      if (!content) return reply.code(400).send({ error: 'content required' });

      const convRes = await query<ConvRow>('select * from conversations where id = $1', [
        conversationId,
      ]);
      if (convRes.rows.length === 0) return reply.code(404).send({ error: 'not found' });
      const convRow = convRes.rows[0]!;

      // Persist the user's message first.
      await query(
        `insert into messages (conversation_id, role, content) values ($1, 'user', $2)`,
        [conversationId, content],
      );

      // Assemble context.
      const momentRow = await momentForConversation(convRow);
      const analysis = (momentRow?.analysis ?? null) as MomentAnalysis | null;
      const venueName = (momentRow?.venue_name as string | null) ?? null;
      const date = momentRow?.started_at
        ? new Date(momentRow.started_at as string).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : null;

      const images: { base64: string; mimeType: string }[] = [];
      if (momentRow) {
        const photos = await photoRowsForMoment(momentRow.id);
        for (const p of photos.slice(0, 8)) {
          if (!p.vision_key) continue;
          const bytes = await storage().get(p.vision_key);
          images.push({ base64: bytes.toString('base64'), mimeType: 'image/jpeg' });
        }
      }

      const historyRes = await query<{ role: 'user' | 'assistant'; content: string }>(
        'select role, content from messages where conversation_id = $1 order by created_at asc',
        [conversationId],
      );

      // SSE setup.
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let full = '';
      try {
        full = await llm().streamConversation(
          { analysis, venueName, date, images, history: historyRes.rows },
          (delta) => send('delta', { text: delta }),
        );
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'stream failed' });
        reply.raw.end();
        return reply;
      }

      // Persist the assistant reply and signal completion.
      await query(
        `insert into messages (conversation_id, role, content) values ($1, 'assistant', $2)`,
        [conversationId, full],
      );
      send('done', { content: full });
      reply.raw.end();
      return reply;
    },
  );
}
