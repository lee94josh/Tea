/**
 * GET /pipeline — under-the-hood status for the iOS Settings screen.
 * Photos by ingest stage, moments by status, topics + articles written vs.
 * pending, and a rough estimate of remaining work.
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth } from '../auth';
import { enqueue, JOBS } from '../queue';
import { articlePauseInfo } from '../jobs/article';

export interface PipelineStatus {
  photos: { total: number; processing: number; done: number; error: number };
  moments: { total: number; pending: number; researching: number; done: number };
  topics: { total: number };
  articles: { written: number; pending: number };
  /** True while anything is still moving through the pipeline. */
  working: boolean;
  /** Coarse "minutes remaining" estimate for outstanding article work. */
  etaMinutes: number | null;
  /** Generation paused because the Gemini key hit its quota. */
  rateLimited: boolean;
  /** Roughly when generation resumes (minutes), when rate limited. */
  resumesInMinutes: number | null;
}

export function pipelineRoutes(app: FastifyInstance): void {
  app.get('/pipeline', { preHandler: requireAuth }, async () => {
    // The app polls this frequently; use it to keep the article drain alive
    // (singleton — no-op if a coordinator loop is already running).
    void enqueue(JOBS.articleCoordinator, {}, { singletonKey: 'article-coord' }).catch(() => {});

    const photo = (
      await query<{ total: string; processing: string; done: string; error: string }>(`
        select count(*)::text total,
               count(*) filter (where ingest_status not in ('done','error'))::text processing,
               count(*) filter (where ingest_status = 'done')::text done,
               count(*) filter (where ingest_status = 'error')::text error
          from photos where is_screenshot = false
      `)
    ).rows[0]!;

    const moment = (
      await query<{ total: string; pending: string; researching: string; done: string }>(`
        select count(*)::text total,
               count(*) filter (where status = 'pending')::text pending,
               count(*) filter (where status = 'analyzed')::text researching,
               count(*) filter (where status in ('researched','seeded'))::text done
          from moments
      `)
    ).rows[0]!;

    const topic = (
      await query<{ total: string }>(
        `select count(*)::text total from discover_topics where name <> '__none__'`,
      )
    ).rows[0]!;

    const article = (
      await query<{ written: string; pending: string }>(`
        select count(*) filter (where article is not null)::text written,
               count(*) filter (where article is null)::text pending
          from discover_topics where name <> '__none__'
      `)
    ).rows[0]!;

    const pause = articlePauseInfo();
    const photosProcessing = Number(photo.processing);
    const momentsActive = Number(moment.pending) + Number(moment.researching);
    const articlesPending = Number(article.pending);
    const working = photosProcessing + momentsActive + articlesPending > 0;

    // Rough: research+article ≈ 1.5 min/moment, article ≈ 1 min each.
    const etaMinutes = working
      ? Math.max(1, Math.ceil(momentsActive * 1.5 + articlesPending * 1 + photosProcessing * 0.2))
      : null;

    const status: PipelineStatus = {
      photos: {
        total: Number(photo.total),
        processing: photosProcessing,
        done: Number(photo.done),
        error: Number(photo.error),
      },
      moments: {
        total: Number(moment.total),
        pending: Number(moment.pending),
        researching: Number(moment.researching),
        done: Number(moment.done),
      },
      topics: { total: Number(topic.total) },
      articles: { written: Number(article.written), pending: articlesPending },
      working,
      etaMinutes,
      rateLimited: pause.rateLimited,
      resumesInMinutes: pause.rateLimited ? Math.ceil(pause.resumesInSeconds / 60) : null,
    };
    return status;
  });
}
