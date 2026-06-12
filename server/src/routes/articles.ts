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
import { backfillArticles } from '../topics';

interface ArticleJson {
  headline?: string;
  dek?: string;
  body_paragraphs?: string[];
  generated_at?: string;
}

export function articleRoutes(app: FastifyInstance): void {
  app.get('/articles', { preHandler: requireAuth }, async () => {
    // Kick generation for any article-less topics in the background.
    void backfillArticles(5).catch((err) =>
      console.warn('[articles] backfill failed:', err),
    );

    const rows = await query<{
      id: string;
      moment_id: string;
      name: string;
      kind: string | null;
      article: ArticleJson | null;
      venue_name: string | null;
      started_at: string | null;
    }>(`
      select t.id, t.moment_id, t.name, t.kind, t.article,
             m.venue_name, m.started_at
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
      });
    }
    return out;
  });
}
