import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';

/**
 * Single static bearer token (single-user app). Accepts either
 * `Authorization: Bearer <token>` or `?token=<token>` (the latter is needed for
 * <img>/EventSource requests that can't set headers).
 */
export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const queryToken = (req.query as { token?: string } | undefined)?.token ?? null;
  const token = bearer ?? queryToken;

  if (!token || token !== env.appToken) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
}
