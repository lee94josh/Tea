/**
 * GET /feed — Instagram-style view: every photo (newest first) with an AI
 * comment drawn from its moment's existing insights (hooks → notable →
 * opener), rotated so photos from the same moment get different comments.
 * Zero extra LLM calls; same data, different experience.
 */

import type { FastifyInstance } from 'fastify';
import type { FeedItem, MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { storage } from '../storage';

export function feedRoutes(app: FastifyInstance): void {
  app.get('/feed', { preHandler: requireAuth }, async () => {
    const rows = await query<{
      photo_id: string;
      vision_key: string | null;
      thumb_key: string | null;
      taken_at: string | null;
      moment_id: string;
      title: string | null;
      venue_name: string | null;
      analysis: MomentAnalysis | null;
      research: MomentResearch | null;
      opener: string | null;
    }>(`
      select p.id as photo_id, p.vision_key, p.thumb_key, p.taken_at,
             m.id as moment_id, m.title, m.venue_name, m.analysis, m.research,
             (select s.opener from conversation_seeds s
               where s.moment_id = m.id order by s.created_at desc limit 1) as opener
        from moment_photos mp
        join photos p on p.id = mp.photo_id
        join moments m on m.id = mp.moment_id
       where p.vision_key is not null
       order by p.taken_at desc nulls last, p.created_at desc
    `);

    // Rotate comments within each moment so a photo dump doesn't repeat itself.
    const perMomentIndex = new Map<string, number>();
    const s = storage();
    const items: FeedItem[] = [];
    for (const r of rows.rows) {
      const i = perMomentIndex.get(r.moment_id) ?? 0;
      perMomentIndex.set(r.moment_id, i + 1);

      const pool: string[] = [
        ...(r.research?.hooks ?? []),
        ...(r.analysis?.notable ?? []),
        ...(r.opener ? [r.opener] : []),
      ];
      items.push({
        photoId: r.photo_id,
        momentId: r.moment_id,
        url: r.vision_key ? await s.url(r.vision_key) : null,
        thumbUrl: r.thumb_key ? await s.url(r.thumb_key) : null,
        takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null,
        title: r.title,
        venueName: r.venue_name,
        comment: pool.length ? pool[i % pool.length]! : null,
      });
    }
    return items;
  });
}
