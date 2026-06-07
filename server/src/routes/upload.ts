/**
 * POST /upload — multipart, multiple files. Requirement 1: store the ORIGINAL
 * bytes untouched, then enqueue ingest:exif as the very first processing step.
 * We do not resize/re-encode/strip anything here.
 */

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { UploadResult } from '@lookback/shared';
import { query } from '../db';
import { storage, keys } from '../storage';
import { enqueue, JOBS } from '../queue';
import { requireAuth } from '../auth';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
};

function pickExt(filename: string, mime: string): string {
  const fromName = extname(filename).slice(1).toLowerCase();
  if (fromName) return fromName;
  return EXT_BY_MIME[mime] ?? 'bin';
}

export function uploadRoutes(app: FastifyInstance): void {
  app.post('/upload', { preHandler: requireAuth }, async (req, reply) => {
    const batchId = randomUUID();
    const accepted: UploadResult['accepted'] = [];
    const rejected: UploadResult['rejected'] = [];

    const parts = req.files();
    for await (const part of parts) {
      const filename = part.filename || 'upload';
      const mime = part.mimetype || 'application/octet-stream';

      if (!mime.startsWith('image/')) {
        // Drain to keep the multipart stream healthy.
        await part.toBuffer().catch(() => {});
        rejected.push({ filename, reason: `not an image (${mime})` });
        continue;
      }

      try {
        const bytes = await part.toBuffer(); // original bytes, untouched
        const photoId = randomUUID();
        const ext = pickExt(filename, mime);
        const originalKey = keys.original(photoId, ext);

        await storage().put(originalKey, bytes, mime);

        await query(
          `insert into photos (id, original_key, mime_original, ingest_status)
           values ($1, $2, $3, 'uploaded')`,
          [photoId, originalKey, mime],
        );

        // First processing step: EXIF, from the original.
        await enqueue(JOBS.exif, { photoId, originalKey });

        accepted.push({ id: photoId, filename });
      } catch (err) {
        rejected.push({
          filename,
          reason: err instanceof Error ? err.message : 'upload failed',
        });
      }
    }

    const result: UploadResult = { batchId, accepted, rejected };
    return reply.send(result);
  });
}
