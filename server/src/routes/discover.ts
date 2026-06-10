/**
 * Discover view — no photos, just learning. Topics are extracted in the
 * pipeline (server/topics.ts) when each moment finishes; this route is a stable
 * read with a one-time background backfill for pre-pipeline moments.
 *
 *   GET  /discover             — all topics (stable order; never blocks)
 *   POST /discover/:id/dive    — generate-or-return the search-grounded dive
 *   POST /discover/:id/verdict — keep/drop feedback on a topic's relevance
 */

import type { FastifyInstance } from 'fastify';
import type { DeepDive, DiscoverTopic, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { research } from '../integrations/research';
import { backfillTopics } from '../topics';

export function discoverRoutes(app: FastifyInstance): void {
  app.get('/discover', { preHandler: requireAuth }, async () => {
    // Never block the page on extraction. Backfill any pre-pipeline moments in
    // the background; the list stays stable (ordered by moment, not topic age)
    // and converges so repeat visits show the same thing.
    void backfillTopics(30).catch((err) =>
      console.warn('[discover] background backfill failed:', err),
    );

    const rows = await query<{
      id: string;
      moment_id: string;
      name: string;
      kind: string | null;
      blurb: string | null;
      deep: unknown;
      verdict: string | null;
      venue_name: string | null;
      title: string | null;
    }>(`
      select t.id, t.moment_id, t.name, t.kind, t.blurb, t.deep, t.verdict,
             m.venue_name, m.title
        from discover_topics t join moments m on m.id = t.moment_id
       where t.name <> '__none__'
       order by m.created_at desc, t.name asc
    `);

    const topics: DiscoverTopic[] = rows.rows.map((r) => ({
      id: r.id,
      momentId: r.moment_id,
      name: r.name,
      kind: r.kind,
      blurb: r.blurb,
      venueName: r.venue_name,
      momentTitle: r.title,
      hasDive: r.deep != null,
      verdict: (r.verdict as DiscoverTopic['verdict']) ?? null,
    }));
    return topics;
  });

  app.post<{ Params: { id: string } }>(
    '/discover/:id/dive',
    { preHandler: requireAuth },
    async (req, reply) => {
      const row = (
        await query<{
          id: string;
          name: string;
          kind: string | null;
          deep: DeepDive | null;
          moment_id: string;
          venue_name: string | null;
          started_at: string | null;
          research: MomentResearch | null;
        }>(`
          select t.id, t.name, t.kind, t.deep, t.moment_id,
                 m.venue_name, m.started_at, m.research
            from discover_topics t join moments m on m.id = t.moment_id
           where t.id = $1
        `, [req.params.id])
      ).rows[0];
      if (!row) return reply.code(404).send({ error: 'topic not found' });
      if (row.deep) return reply.send(row.deep);

      const date = row.started_at
        ? new Date(row.started_at).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : null;
      const dive = await research().deepDive(
        { name: row.name, kind: row.kind },
        {
          venueName: row.venue_name,
          date,
          facts: (row.research?.facts ?? []).map((f) => f.fact).slice(0, 10),
        },
      );
      // Only cache substantive dives; an empty/flaky one should retry next tap.
      if (dive.body_paragraphs.length > 0) {
        await query('update discover_topics set deep = $2 where id = $1', [
          row.id,
          JSON.stringify(dive),
        ]);
      }
      return reply.send(dive);
    },
  );

  // Relevance feedback: keep / drop / clear. Persisted on the topic (so the UI
  // reflects it) and logged to `feedback` for prompt-tuning data.
  app.post<{ Params: { id: string }; Body: { verdict: 'keep' | 'drop' | null } }>(
    '/discover/:id/verdict',
    { preHandler: requireAuth },
    async (req, reply) => {
      const verdict = req.body?.verdict ?? null;
      if (verdict !== 'keep' && verdict !== 'drop' && verdict !== null) {
        return reply.code(400).send({ error: 'verdict must be keep | drop | null' });
      }
      const row = (
        await query<{ name: string; kind: string | null; moment_id: string }>(
          'select name, kind, moment_id from discover_topics where id = $1',
          [req.params.id],
        )
      ).rows[0];
      if (!row) return reply.code(404).send({ error: 'topic not found' });

      await query('update discover_topics set verdict = $2 where id = $1', [
        req.params.id,
        verdict,
      ]);
      await query(
        `insert into feedback (kind, payload) values ('topic_relevance', $1)`,
        [JSON.stringify({ topicId: req.params.id, name: row.name, kind: row.kind, verdict })],
      );
      return reply.send({ ok: true });
    },
  );
}
