/**
 * Discover topic extraction — runs once per moment (in the pipeline), and as a
 * convergent background backfill for moments that predate it. Topics are
 * globally unique by name so the same venue/dish/person isn't listed twice.
 */

import type { MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from './db';
import { research } from './integrations/research';
import { env } from './env';

/** Has this moment already had topic extraction attempted? */
async function alreadyExtracted(momentId: string): Promise<boolean> {
  const r = await query<{ n: string }>(
    `select count(*)::text as n from discover_topics where moment_id = $1`,
    [momentId],
  );
  return Number(r.rows[0]?.n ?? '0') > 0;
}

export async function extractAndStoreTopics(momentId: string): Promise<void> {
  if (!env.gemini.apiKey) return;
  if (await alreadyExtracted(momentId)) return;

  const m = (
    await query<{
      analysis: MomentAnalysis | null;
      research: MomentResearch | null;
      venue_name: string | null;
    }>('select analysis, research, venue_name from moments where id = $1', [momentId])
  ).rows[0];
  if (!m || !m.analysis) return;

  const topics = await research().extractTopics(m.analysis, m.research, m.venue_name);
  for (const t of topics) {
    // Global consolidation: one topic per name across ALL moments.
    const dupe = await query<{ n: string }>(
      `select count(*)::text as n from discover_topics
        where lower(name) = lower($1) and name <> '__none__'`,
      [t.name],
    );
    if (Number(dupe.rows[0]?.n ?? '0') > 0) continue;
    await query(
      `insert into discover_topics (moment_id, name, kind, blurb)
       values ($1,$2,$3,$4) on conflict do nothing`,
      [momentId, t.name, t.kind, t.blurb],
    );
  }
  // Sentinel so this moment is never re-extracted, even if all topics deduped.
  await query(
    `insert into discover_topics (moment_id, name, kind, blurb)
     values ($1, '__none__', 'other', null) on conflict do nothing`,
    [momentId],
  );
}

/** Backfill moments that finished before pipeline extraction existed. Converges. */
export async function backfillTopics(limit: number): Promise<void> {
  if (!env.gemini.apiKey) return;
  const missing = await query<{ id: string }>(`
    select m.id from moments m
     where m.analysis is not null and m.status in ('researched','seeded')
       and not exists (select 1 from discover_topics t where t.moment_id = m.id)
     order by m.created_at desc
     limit $1
  `, [limit]);
  for (const row of missing.rows) {
    try {
      await extractAndStoreTopics(row.id);
    } catch (err) {
      console.warn(`[discover] backfill failed for ${row.id} (non-fatal):`, err);
    }
  }
}
