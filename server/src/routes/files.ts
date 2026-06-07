/**
 * GET /files/:key — serves files from the disk storage driver (originals are
 * never exposed here for editing; this is read-only). For the R2 driver this
 * route is unused because URLs are signed S3 URLs.
 */

import type { FastifyInstance } from 'fastify';
import { storage } from '../storage';
import { env } from '../env';
import { requireAuth } from '../auth';

const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function fileRoutes(app: FastifyInstance): void {
  if (env.storage.driver !== 'disk') return;

  app.get<{ Params: { key: string } }>(
    '/files/:key',
    { preHandler: requireAuth },
    async (req, reply) => {
      const key = decodeURIComponent(req.params.key);
      try {
        const bytes = await storage().get(key);
        const ext = key.split('.').pop()?.toLowerCase() ?? '';
        reply.header('Content-Type', CONTENT_TYPE[ext] ?? 'application/octet-stream');
        reply.header('Cache-Control', 'private, max-age=86400');
        return reply.send(bytes);
      } catch {
        return reply.code(404).send({ error: 'not found' });
      }
    },
  );
}
