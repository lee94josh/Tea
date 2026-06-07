/**
 * POST /push/subscribe        — store a web-push subscription.
 * GET  /push/vapid-public-key — public VAPID key for the client to subscribe.
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { env } from '../env';
import { requireAuth } from '../auth';

export function pushRoutes(app: FastifyInstance): void {
  app.get('/push/vapid-public-key', { preHandler: requireAuth }, async () => {
    return { publicKey: env.vapid.publicKey };
  });

  app.post<{ Body: { subscription: unknown } }>(
    '/push/subscribe',
    { preHandler: requireAuth },
    async (req, reply) => {
      const sub = req.body?.subscription;
      if (!sub || typeof sub !== 'object') {
        return reply.code(400).send({ error: 'subscription required' });
      }
      const endpoint = (sub as { endpoint?: string }).endpoint ?? '';
      // De-dupe on endpoint so re-subscribing doesn't pile up rows.
      await query('delete from push_subscriptions where subscription->>\'endpoint\' = $1', [
        endpoint,
      ]);
      await query('insert into push_subscriptions (subscription) values ($1)', [
        JSON.stringify(sub),
      ]);
      return reply.send({ ok: true });
    },
  );
}
