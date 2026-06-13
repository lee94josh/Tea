/**
 * GET /articles — the personalized newspaper. One definitive feature article
 * per topic (write-once), newest first, each carrying the photos of the moment
 * that surfaced it. Self-populating: hitting the route enqueues generation for
 * topics that don't have an article yet (bounded; converges).
 */

import type { FastifyInstance } from 'fastify';
import type { Article, PhotoRef } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { enqueue, JOBS } from '../queue';
import { tierForScore } from '../integrations/anthropic';

interface ArticleJson {
  headline?: string;
  dek?: string;
  body_paragraphs?: string[];
  generated_at?: string;
}

export function articleRoutes(app: FastifyInstance): void {
  app.get('/articles', { preHandler: requireAuth }, async () => {
    // Ensure the self-draining article coordinator is running (singleton).
    void enqueue(JOBS.articleCoordinator, {}, { singletonKey: 'article-coord' }).catch(() => {});

    const rows = await query<{
      id: string;
      moment_id: string;
      name: string;
      kind: string | null;
      article: ArticleJson | null;
      venue_name: string | null;
      started_at: string | null;
      score: number | null;
      user_rating: number | null;
    }>(`
      select t.id, t.moment_id, t.name, t.kind, t.article,
             m.venue_name, m.started_at, t.score, t.user_rating
        from discover_topics t join moments m on m.id = t.moment_id
       where t.name <> '__none__' and t.article is not null
         and coalesce(t.verdict, '') <> 'drop'
       order by t.article->>'generated_at' desc nulls last
    `);

    const s = storage();
    const out: Article[] = [];
    for (const r of rows.rows) {
      const a = r.article ?? {};
      const photoRows = await query<{
        id: string;
        thumb_key: string | null;
        vision_key: string | null;
        taken_at: string | null;
      }>(
        `select p.id, p.thumb_key, p.vision_key, p.taken_at
           from moment_photos mp join photos p on p.id = mp.photo_id
          where mp.moment_id = $1 and p.thumb_key is not null
          order by p.taken_at nulls last limit 6`,
        [r.moment_id],
      );
      const photos: PhotoRef[] = [];
      for (const p of photoRows.rows) {
        photos.push({
          id: p.id,
          thumbUrl: p.thumb_key ? await s.url(p.thumb_key) : null,
          visionUrl: p.vision_key ? await s.url(p.vision_key) : null,
          takenAt: p.taken_at ? new Date(p.taken_at).toISOString() : null,
        });
      }
      out.push({
        id: r.id,
        momentId: r.moment_id,
        headline: a.headline ?? r.name,
        dek: a.dek ?? '',
        bodyParagraphs: a.body_paragraphs ?? [],
        topicName: r.name,
        kind: r.kind,
        venueName: r.venue_name,
        momentDate: r.started_at ? new Date(r.started_at).toISOString() : null,
        generatedAt: a.generated_at ?? new Date(0).toISOString(),
        photos,
        score: r.score,
        predictedTier: r.score != null ? tierForScore(r.score) : null,
        userRating: r.user_rating,
      });
    }
    return out;
  });

  // The reader's 1–5 tier verdict (1 = best). Stored on the topic; future
  // judging uses these as liked/disliked exemplars.
  app.post<{ Params: { id: string }; Body: { rating?: number } }>(
    '/articles/:id/rating',
    { preHandler: requireAuth },
    async (req, reply) => {
      const rating = Number(req.body?.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return reply.code(400).send({ error: 'rating must be an integer 1-5' });
      }
      const r = await query(
        `update discover_topics set user_rating = $2
          where id = $1 and article is not null`,
        [req.params.id, rating],
      );
      if (r.rowCount === 0) return reply.code(404).send({ error: 'article not found' });
      return { ok: true };
    },
  );
}
