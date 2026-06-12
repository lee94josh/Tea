/**
 * `article:generate` — write the one definitive feature article for a Discover
 * topic (the personalized newspaper). Write-once: if the topic already has an
 * article, this is a no-op. Non-fatal: a failed generation just means the
 * backfill enqueues it again on a later /articles request.
 */

import type { MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { research } from '../integrations/research';
import { env } from '../env';

export interface ArticleJob {
  topicId: string;
}

export async function runArticleGenerate(data: ArticleJob): Promise<void> {
  if (!env.gemini.apiKey) return;
  const row = (
    await query<{
      id: string;
      name: string;
      kind: string | null;
      blurb: string | null;
      article: unknown;
      moment_id: string;
      venue_name: string | null;
      started_at: string | null;
      research: MomentResearch | null;
    }>(`
      select t.id, t.name, t.kind, t.blurb, t.article, t.moment_id,
             m.venue_name, m.started_at, m.research
        from discover_topics t join moments m on m.id = t.moment_id
       where t.id = $1
    `, [data.topicId])
  ).rows[0];
  if (!row || row.name === '__none__') return;
  if (row.article != null) return; // write-once

  const date = row.started_at
    ? new Date(row.started_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  const article = await research().writeArticle(
    { name: row.name, kind: row.kind },
    {
      venueName: row.venue_name,
      date,
      facts: (row.research?.facts ?? []).map((f) => f.fact).slice(0, 12),
      blurb: row.blurb,
    },
  );
  if (!article) {
    console.warn(`[article] empty generation for topic ${row.name} — will retry via backfill`);
    return;
  }

  await query(
    `update discover_topics set article = $2 where id = $1 and article is null`,
    [row.id, JSON.stringify({ ...article, generated_at: new Date().toISOString() })],
  );
  console.log(`[article] wrote "${article.headline}" (${row.name})`);
}
