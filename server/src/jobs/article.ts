/**
 * The newspaper's article writer, as a SINGLE-FLIGHT, self-paced drain.
 *
 * Why this shape: every uploaded photo can spawn topics, and each article is a
 * search-grounded LLM call. Fanning them out hammered the Gemini key into
 * 429 (quota) errors. Instead, one coordinator writes ONE article per run and
 * re-schedules itself — fast when healthy, long backoff when rate-limited —
 * so generation paces itself and resumes automatically when quota returns.
 */

import type { MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { research } from '../integrations/research';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';

export interface ArticleJob {
  topicId: string;
}

/** Module state so /pipeline can tell the user "paused for quota" honestly. */
let pausedUntil = 0; // epoch ms
export function articlePauseInfo(): { rateLimited: boolean; resumesInSeconds: number } {
  const remaining = Math.max(0, pausedUntil - Date.now());
  return { rateLimited: remaining > 0, resumesInSeconds: Math.ceil(remaining / 1000) };
}

function isRateLimit(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|Too Many Requests|quota/i.test(m);
}

/** Write the article for one topic. Throws on API error; returns false if the
 *  topic is gone / already written. */
async function generateArticleForTopic(topicId: string): Promise<boolean> {
  const row = (
    await query<{
      id: string;
      name: string;
      kind: string | null;
      blurb: string | null;
      article: unknown;
      venue_name: string | null;
      started_at: string | null;
      research: MomentResearch | null;
    }>(`
      select t.id, t.name, t.kind, t.blurb, t.article,
             m.venue_name, m.started_at, m.research
        from discover_topics t join moments m on m.id = t.moment_id
       where t.id = $1
    `, [topicId])
  ).rows[0];
  if (!row || row.name === '__none__' || row.article != null) return false;

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
  if (!article) return false; // genuinely empty (rare); leave for a later sweep
  await query(
    `update discover_topics set article = $2 where id = $1 and article is null`,
    [row.id, JSON.stringify({ ...article, generated_at: new Date().toISOString() })],
  );
  console.log(`[article] wrote "${article.headline}" (${row.name})`);
  return true;
}

/** Kept as a registered job for direct/pipeline use; same single-write logic. */
export async function runArticleGenerate(data: ArticleJob): Promise<void> {
  if (!env.gemini.apiKey) return;
  await generateArticleForTopic(data.topicId);
}

/** The drain. One article per invocation, then re-schedule until none remain. */
export async function runArticleCoordinator(): Promise<void> {
  if (!env.gemini.apiKey) return;

  // If we're in a backoff window, just re-arm and leave the key alone.
  const stillPaused = pausedUntil - Date.now();
  if (stillPaused > 0) {
    await rechain(Math.ceil(stillPaused / 1000) + 1);
    return;
  }

  const next = (
    await query<{ id: string }>(
      `select id from discover_topics
         where name <> '__none__' and article is null
         order by created_at asc limit 1`,
    )
  ).rows[0];
  if (!next) return; // all caught up — stop the loop

  try {
    await generateArticleForTopic(next.id);
    pausedUntil = 0;
    await rechain(8); // healthy pace: ~one every 8s
  } catch (err) {
    if (isRateLimit(err)) {
      pausedUntil = Date.now() + 10 * 60 * 1000; // quota — wait 10 min, then probe
      console.warn('[article] rate limited (quota); pausing 10 min');
      await rechain(10 * 60);
    } else {
      console.warn('[article] generation failed (will retry):', err instanceof Error ? err.message : err);
      await rechain(45);
    }
  }
}

async function rechain(seconds: number): Promise<void> {
  await enqueue(
    JOBS.articleCoordinator,
    {},
    { singletonKey: 'article-coord', singletonSeconds: seconds, startAfter: seconds },
  );
}
