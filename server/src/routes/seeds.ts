/**
 * GET  /moments           — all seeded moments (quality-ordered) for prev/next
 *                           navigation, each linked to its conversation if started.
 * GET  /seeds/next        — highest-quality unused seed + its moment & photos.
 * POST /seeds/:id/start   — create a conversation from a seed; persist the
 *                           opener as the first assistant message.
 */

import type { FastifyInstance } from 'fastify';
import type { MomentListItem, NextSeed, StartedConversation } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { toMoment, toSeed, toConversation, toPhotoRef } from '../serialize';

interface PhotoRow {
  id: string;
  thumb_key: string | null;
  vision_key: string | null;
  taken_at: string | null;
}

async function momentPhotos(momentId: string): Promise<PhotoRow[]> {
  const res = await query<PhotoRow>(
    `select p.id, p.thumb_key, p.vision_key, p.taken_at
       from moment_photos mp join photos p on p.id = mp.photo_id
       where mp.moment_id = $1
       order by p.taken_at nulls last`,
    [momentId],
  );
  return res.rows;
}

export function seedRoutes(app: FastifyInstance): void {
  app.get('/moments', { preHandler: requireAuth }, async () => {
    const rows = await query<{
      seed_id: string;
      opener: string;
      suggested_replies: unknown;
      quality_score: number | null;
      moment_id: string;
      title: string | null;
      venue_name: string | null;
      started_at: string | null;
      conversation_id: string | null;
    }>(`
      select s.id as seed_id, s.opener, s.suggested_replies, s.quality_score,
             m.id as moment_id, m.title, m.venue_name, m.started_at,
             (select c.id from conversations c where c.seed_id = s.id
                order by c.created_at desc limit 1) as conversation_id
        from conversation_seeds s
        join moments m on m.id = s.moment_id
       order by s.quality_score desc nulls last, s.created_at asc
    `);

    const items: MomentListItem[] = await Promise.all(
      rows.rows.map(async (r) => ({
        momentId: r.moment_id,
        seedId: r.seed_id,
        conversationId: r.conversation_id ?? null,
        title: r.title,
        venueName: r.venue_name,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        qualityScore: r.quality_score,
        opener: r.opener,
        suggestedReplies: Array.isArray(r.suggested_replies)
          ? (r.suggested_replies as string[])
          : [],
        photos: await Promise.all((await momentPhotos(r.moment_id)).map(toPhotoRef)),
      })),
    );
    return items;
  });

  app.get('/seeds/next', { preHandler: requireAuth }, async () => {
    const seedRes = await query(
      `select * from conversation_seeds
         where status = 'unused'
         order by quality_score desc nulls last, created_at asc
         limit 1`,
    );
    if (seedRes.rows.length === 0) return null;
    const seed = toSeed(seedRes.rows[0]!);

    const momentRes = await query('select * from moments where id = $1', [seed.momentId]);
    const moment = toMoment(momentRes.rows[0]!);
    const photos = await Promise.all((await momentPhotos(seed.momentId)).map(toPhotoRef));

    const payload: NextSeed = { seed, moment, photos };
    return payload;
  });

  app.post<{ Params: { id: string } }>(
    '/seeds/:id/start',
    { preHandler: requireAuth },
    async (req, reply) => {
      const seedId = req.params.id;
      const seedRes = await query('select * from conversation_seeds where id = $1', [seedId]);
      if (seedRes.rows.length === 0) return reply.code(404).send({ error: 'seed not found' });
      const seed = toSeed(seedRes.rows[0]!);

      const convRes = await query(
        'insert into conversations (seed_id) values ($1) returning *',
        [seedId],
      );
      const conversation = toConversation(convRes.rows[0]!);

      // The opener is the assistant's first turn — persist it so history resumes.
      await query(
        `insert into messages (conversation_id, role, content) values ($1, 'assistant', $2)`,
        [conversation.id, seed.opener],
      );
      await query(`update conversation_seeds set status = 'started' where id = $1`, [seedId]);

      const momentRes = await query('select * from moments where id = $1', [seed.momentId]);
      const moment = toMoment(momentRes.rows[0]!);
      const photos = await Promise.all((await momentPhotos(seed.momentId)).map(toPhotoRef));

      const payload: StartedConversation = {
        conversation,
        opener: seed.opener,
        suggestedReplies: seed.suggestedReplies,
        moment,
        photos,
      };
      return reply.send(payload);
    },
  );
}
