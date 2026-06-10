/**
 * GET /debug/moments — dev/prototyping mode. Everything the app knows or has
 * inferred, per moment: photo metadata (EXIF, GPS, flags), venue candidates
 * with confidence/source, the full vision analysis (incl. venue_guess
 * reasoning), the research results (facts/hooks/open questions), and the seed.
 */

import type { FastifyInstance } from 'fastify';
import type { DebugMoment, DebugPhoto, DebugVenueCandidate } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { toMoment } from '../serialize';

export function debugRoutes(app: FastifyInstance): void {
  app.get('/debug/moments', { preHandler: requireAuth }, async () => {
    const moments = await query('select * from moments order by started_at desc nulls last');

    const out: DebugMoment[] = [];
    for (const mRow of moments.rows) {
      const moment = toMoment(mRow);

      const photoRows = await query<{
        id: string;
        thumb_key: string | null;
        taken_at: string | null;
        lat: number | null;
        lng: number | null;
        camera_make: string | null;
        camera_model: string | null;
        width: number | null;
        height: number | null;
        is_screenshot: boolean;
        ingest_status: DebugPhoto['ingestStatus'];
      }>(
        `select p.id, p.thumb_key, p.taken_at, p.lat, p.lng, p.camera_make,
                p.camera_model, p.width, p.height, p.is_screenshot, p.ingest_status
           from moment_photos mp join photos p on p.id = mp.photo_id
          where mp.moment_id = $1 order by p.taken_at nulls last`,
        [moment.id],
      );

      const photos: DebugPhoto[] = [];
      for (const p of photoRows.rows) {
        const venues = await query<DebugVenueCandidate & Record<string, unknown>>(
          `select name, category, address, confidence, source
             from venues where photo_id = $1 order by confidence desc nulls last`,
          [p.id],
        );
        photos.push({
          id: p.id,
          thumbUrl: p.thumb_key ? await storage().url(p.thumb_key) : null,
          takenAt: p.taken_at ? new Date(p.taken_at).toISOString() : null,
          lat: p.lat,
          lng: p.lng,
          cameraMake: p.camera_make,
          cameraModel: p.camera_model,
          width: p.width,
          height: p.height,
          isScreenshot: p.is_screenshot,
          ingestStatus: p.ingest_status,
          venues: venues.rows.map((v) => ({
            name: v.name,
            category: v.category,
            address: v.address,
            confidence: v.confidence,
            source: v.source,
          })),
        });
      }

      const seedRow = (
        await query<{
          opener: string;
          openers: unknown;
          suggested_replies: unknown;
          quality_score: number | null;
          status: 'unused' | 'started' | 'done';
        }>(
          `select opener, openers, suggested_replies, quality_score, status
             from conversation_seeds where moment_id = $1
            order by created_at desc limit 1`,
          [moment.id],
        )
      ).rows[0];

      out.push({
        moment,
        photos,
        seed: seedRow
          ? {
              opener: seedRow.opener,
              openers:
                Array.isArray(seedRow.openers) && seedRow.openers.length > 0
                  ? (seedRow.openers as string[])
                  : [seedRow.opener],
              suggestedReplies: Array.isArray(seedRow.suggested_replies)
                ? (seedRow.suggested_replies as string[])
                : [],
              qualityScore: seedRow.quality_score,
              status: seedRow.status,
            }
          : null,
      });
    }
    return out;
  });
}
