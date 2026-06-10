/**
 * Discover view — no photos, just learning. Topics are extracted lazily from
 * each researched moment (cached in discover_topics); tapping one triggers a
 * search-grounded deep dive, also cached.
 *
 *   GET  /discover           — all topics (extracts for new moments on demand)
 *   POST /discover/:id/dive  — generate-or-return the deep dive
 */

import type { FastifyInstance } from 'fastify';
import type { DeepDive, DiscoverTopic, MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { research } from '../integrations/research';
import { env } from '../env';

/** Extract topics for moments that have research but no topics yet (bounded). */
async function extractMissing(limit: number): Promise<void> {
  if (!env.gemini.apiKey) return;
  const missing = await query<{
    id: string;
    analysis: MomentAnalysis | null;
    research: MomentResearch | null;
    venue_name: string | null;
  }>(`
    select m.id, m.analysis, m.research, m.venue_name
      from moments m
     where m.analysis is not null
       and m.status in ('researched','seeded')
       and not exists (select 1 from discover_topics t where t.moment_id = m.id)
     order by m.created_at desc
     limit $1
  `, [limit]);

  for (const m of missing.rows) {
    if (!m.analysis) continue;
    try {
      const topics = await research().extractTopics(m.analysis, m.research, m.venue_name);
      for (const t of topics) {
        await query(
          `insert into discover_topics (moment_id, name, kind, blurb)
           values ($1,$2,$3,$4) on conflict (moment_id, name) do nothing`,
          [m.id, t.name, t.kind, t.blurb],
        );
      }
      // Mark extraction attempted even if zero topics, to avoid re-spinning.
      if (topics.length === 0) {
        await query(
          `insert into discover_topics (moment_id, name, kind, blurb)
           values ($1, '__none__', 'other', null) on conflict do nothing`,
          [m.id],
        );
      }
    } catch (err) {
      console.warn(`[discover] topic extraction failed for ${m.id} (non-fatal):`, err);
    }
  }
}

export function discoverRoutes(app: FastifyInstance): void {
  app.get('/discover', { preHandler: requireAuth }, async () => {
    // Lazily backfill a few moments per request — keeps the page self-populating
    // without a pipeline change or reprocess.
    await extractMissing(3);

    const rows = await query<{
      id: string;
      moment_id: string;
      name: string;
      kind: string | null;
      blurb: string | null;
      deep: unknown;
      venue_name: string | null;
      title: string | null;
    }>(`
      select t.id, t.moment_id, t.name, t.kind, t.blurb, t.deep,
             m.venue_name, m.title
        from discover_topics t join moments m on m.id = t.moment_id
       where t.name <> '__none__'
       order by t.created_at desc
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
}
