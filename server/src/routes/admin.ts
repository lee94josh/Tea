/**
 * POST /admin/reprocess — re-run the analysis pipeline over all existing
 * photos. Wipes derived data (moments, seeds, conversations) but NEVER touches
 * uploaded photos, their EXIF, derivatives, or venue lookups. Then re-clusters,
 * which cascades back through analyze -> research -> seed with the current
 * prompts/logic.
 *
 * Conversations and chat history ARE discarded (they're regenerated). Feedback
 * rows are kept (seed/conversation refs null out).
 */

import type { FastifyInstance } from 'fastify';
import { query, tx } from '../db';
import { enqueue, JOBS } from '../queue';
import { requireAuth } from '../auth';

export function adminRoutes(app: FastifyInstance): void {
  app.post('/admin/reprocess', { preHandler: requireAuth }, async () => {
    const photoCount = await query<{ n: string }>(
      `select count(*)::text as n from photos
        where is_screenshot = false and ingest_status = 'done'`,
    );

    const wiped = await tx(async (client) => {
      // Order matters: conversations RESTRICT-reference seeds.
      const conv = await client.query('delete from conversations');
      const moments = await client.query('delete from moments'); // cascades seeds + moment_photos
      return { conversations: conv.rowCount ?? 0, moments: moments.rowCount ?? 0 };
    });

    // Re-cluster from scratch (idempotency guard passes now that moments are 0).
    await enqueue(JOBS.clusterMoments, {}, { singletonKey: 'cluster-run' });

    return {
      ok: true,
      reprocessing: Number(photoCount.rows[0]?.n ?? '0'),
      wiped,
    };
  });
}
