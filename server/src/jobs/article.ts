/**
 * The newspaper's article writer, as a SINGLE-FLIGHT, self-paced drain.
 *
 * Why this shape: every uploaded photo can spawn topics, and each article is a
 * search-grounded LLM call. Fanning them out hammered the Gemini key into
 * 429 (quota) errors. Instead, one coordinator does ONE unit of work per run
 * and re-schedules itself — fast when healthy, long backoff when rate-limited.
 *
 * The drain now has three phases, all driven by the same loop:
 *   1. SCORE — judge unscored topics against the worthiness rubric (Haiku);
 *      below-threshold topics are shelved, never written.
 *   2. CULL (once) — after the initial backlog is fully scored, shelve all but
 *      the top N so the launch paper is ~ARTICLE_CULL_TARGET strong pieces.
 *   3. WRITE — best-first article generation (Sonnet + web search, Gemini
 *      fallback), one per run.
 */

import type { MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { research } from '../integrations/research';
import {
  anthropicEnabled,
  judgeTopic,
  writeArticleAnthropic,
} from '../integrations/anthropic';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';

/** A single photo cluster shouldn't become five articles. */
const MAX_ARTICLES_PER_MOMENT = 2;

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
  return /\b429\b|RESOURCE_EXHAUSTED|Too Many Requests|quota|rate.?limit/i.test(m);
}

interface TopicRow {
  id: string;
  name: string;
  kind: string | null;
  blurb: string | null;
  article: unknown;
  venue_name: string | null;
  started_at: string | null;
  analysis: MomentAnalysis | null;
  research: MomentResearch | null;
}

async function loadTopic(topicId: string): Promise<TopicRow | undefined> {
  return (
    await query<TopicRow>(`
      select t.id, t.name, t.kind, t.blurb, t.article,
             m.venue_name, m.started_at, m.analysis, m.research
        from discover_topics t join moments m on m.id = t.moment_id
       where t.id = $1
    `, [topicId])
  ).rows[0];
}

function momentDate(row: TopicRow): string | null {
  return row.started_at
    ? new Date(row.started_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;
}

// ---------------------------------------------------------------------------
// Phase 1: scoring
// ---------------------------------------------------------------------------

/** Judge one topic; shelve it if it misses the bar. Throws on API errors. */
async function scoreTopic(topicId: string): Promise<void> {
  const row = await loadTopic(topicId);
  if (!row || row.name === '__none__') return;

  // The reader's 1–5 tier ratings become calibration exemplars: what they
  // loved (1–2) and what bored them (4–5) anchors future judging.
  const rated = await query<{ name: string; user_rating: number }>(
    `select name, user_rating from discover_topics
      where user_rating is not null order by created_at desc limit 24`,
  );
  const exemplars = {
    liked: rated.rows.filter((r) => r.user_rating <= 2).map((r) => r.name),
    disliked: rated.rows.filter((r) => r.user_rating >= 4).map((r) => r.name),
  };

  const verdict = await judgeTopic(
    { name: row.name, kind: row.kind, blurb: row.blurb },
    {
      venueName: row.venue_name,
      date: momentDate(row),
      facts: (row.research?.facts ?? []).map((f) => f.fact).slice(0, 8),
      analysisSummary: row.analysis
        ? `${row.analysis.title}. ${row.analysis.summary}`.slice(0, 600)
        : null,
    },
    exemplars,
  );

  const shelve = verdict.score < env.articles.scoreMin && row.article == null;
  await query(
    `update discover_topics set score = $2, score_reasons = $3, shelved = $4 where id = $1`,
    [
      row.id,
      verdict.score,
      JSON.stringify({ ...verdict.reasons, rationale: verdict.rationale }),
      shelve,
    ],
  );
  console.log(
    `[article] scored "${row.name}" → ${verdict.score}${shelve ? ' (shelved)' : ''}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 2: one-time backlog cull
// ---------------------------------------------------------------------------

/** After the launch backlog is fully scored, keep only the strongest topics so
 *  the paper holds ~cullTarget articles total. Runs exactly once (app_flags). */
async function maybeApplyInitialCull(): Promise<void> {
  const done = await query(`select 1 from app_flags where name = 'initial_cull_done'`);
  if (done.rows.length > 0) return;

  const written = Number(
    (
      await query<{ n: string }>(
        `select count(*)::text n from discover_topics
          where name <> '__none__' and article is not null`,
      )
    ).rows[0]?.n ?? '0',
  );
  const keep = Math.max(0, env.articles.cullTarget - written);
  const culled = await query<{ name: string }>(
    `update discover_topics set shelved = true
      where id in (
        select id from discover_topics
         where name <> '__none__' and article is null and not shelved
         order by score desc nulls last, created_at asc
         offset $1
      )
      returning name`,
    [keep],
  );
  await query(`insert into app_flags (name) values ('initial_cull_done') on conflict do nothing`);
  console.log(
    `[article] initial cull: kept top ${keep} pending topics, shelved ${culled.rows.length}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 3: writing
// ---------------------------------------------------------------------------

/** Write the article for one topic. Throws on API error; returns false if the
 *  topic is gone / already written. */
async function generateArticleForTopic(topicId: string): Promise<boolean> {
  const row = await loadTopic(topicId);
  if (!row || row.name === '__none__' || row.article != null) return false;

  const topic = { name: row.name, kind: row.kind };
  const context = {
    venueName: row.venue_name,
    date: momentDate(row),
    facts: (row.research?.facts ?? []).map((f) => f.fact).slice(0, 12),
    blurb: row.blurb,
  };

  // Sonnet writes the paper; Gemini is the fallback so a single-provider
  // outage degrades the byline, not the edition. If BOTH fail, the last
  // error propagates and the coordinator backs off.
  let article: { headline: string; dek: string; body_paragraphs: string[] } | null = null;
  let writerErr: unknown = null;
  if (anthropicEnabled()) {
    try {
      article = await writeArticleAnthropic(topic, context);
    } catch (err) {
      writerErr = err;
      console.warn(
        `[article] anthropic writer failed for "${row.name}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (!article && (writerErr || !anthropicEnabled())) {
    if (!env.gemini.apiKey) throw writerErr ?? new Error('no writer configured');
    article = await research().writeArticle(topic, context);
  }
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
  if (!env.gemini.apiKey && !anthropicEnabled()) return;
  await generateArticleForTopic(data.topicId);
}

// ---------------------------------------------------------------------------
// The drain
// ---------------------------------------------------------------------------

/** One unit of work per invocation, then re-schedule until none remain. */
export async function runArticleCoordinator(): Promise<void> {
  if (!env.gemini.apiKey && !anthropicEnabled()) return;

  // If we're in a backoff window, just re-arm and leave the keys alone.
  const stillPaused = pausedUntil - Date.now();
  if (stillPaused > 0) {
    await rechain(Math.ceil(stillPaused / 1000) + 1);
    return;
  }

  try {
    // Phase 1: score before writing (only when the judge is configured —
    // without it, scores stay null and everything is written, as before).
    if (anthropicEnabled()) {
      // Already-written articles get scored too — the reader sees the
      // predicted tier on every piece (scoreTopic never shelves a written one).
      const unscored = (
        await query<{ id: string }>(
          `select id from discover_topics
             where name <> '__none__' and not shelved and score is null
             order by (article is null) desc, created_at asc limit 1`,
        )
      ).rows[0];
      if (unscored) {
        await scoreTopic(unscored.id);
        pausedUntil = 0;
        await rechain(2); // scoring is cheap — drain it fast
        return;
      }
      // Phase 2: everything scored → apply the one-time launch cull.
      await maybeApplyInitialCull();
    } else if (env.articles.requireJudge) {
      // Articles are write-once: without the judge, a quota refresh would
      // permanently print the entire unscored backlog. Hold the presses until
      // ANTHROPIC_API_KEY arrives (set ARTICLE_REQUIRE_JUDGE=0 to opt out).
      const unwritten = (
        await query<{ n: string }>(
          `select count(*)::text n from discover_topics
            where name <> '__none__' and article is null and not shelved and score is null`,
        )
      ).rows[0];
      if (Number(unwritten?.n ?? '0') > 0) {
        console.warn('[article] holding presses: unscored topics and no judge configured');
        await rechain(15 * 60); // probe again in case the key shows up
        return;
      }
    }

    // Phase 3: write the strongest remaining topic — but at most 2 per moment
    // (one photo cluster shouldn't spawn five articles), so a moment that
    // already has 2 written topics is skipped.
    const next = (
      await query<{ id: string }>(
        `select t.id from discover_topics t
           where t.name <> '__none__' and t.article is null and not t.shelved
             and (
               select count(*) from discover_topics w
                where w.moment_id = t.moment_id and w.article is not null
             ) < ${MAX_ARTICLES_PER_MOMENT}
           order by t.score desc nulls last, t.created_at asc limit 1`,
      )
    ).rows[0];
    if (!next) return; // all caught up — stop the loop

    await generateArticleForTopic(next.id);
    pausedUntil = 0;
    await rechain(8); // healthy pace: ~one every 8s
  } catch (err) {
    if (isRateLimit(err)) {
      pausedUntil = Date.now() + 10 * 60 * 1000; // quota — wait 10 min, then probe
      console.warn('[article] rate limited (quota); pausing 10 min');
      await rechain(10 * 60);
    } else {
      console.warn('[article] coordinator failed (will retry):', err instanceof Error ? err.message : err);
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
