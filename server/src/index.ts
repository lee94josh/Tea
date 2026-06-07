/**
 * Lookback server — Fastify HTTP API + in-process pg-boss worker.
 * One long-running container hosts both (analysis jobs are long-running, so this
 * is deliberately NOT serverless).
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './env';
import { pool } from './db';
import { startBoss } from './queue';
import { registerJobs } from './jobs/index';
import { uploadRoutes } from './routes/upload';
import { statusRoutes } from './routes/status';
import { seedRoutes } from './routes/seeds';
import { conversationRoutes } from './routes/conversations';
import { pushRoutes } from './routes/push';
import { fileRoutes } from './routes/files';

async function main() {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 50 });

  await app.register(cors, {
    origin: [env.webOrigin],
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 1024 * 1024 * 200, files: 500 }, // generous: originals, untouched
  });

  app.get('/health', async () => ({ ok: true }));

  uploadRoutes(app);
  statusRoutes(app);
  seedRoutes(app);
  conversationRoutes(app);
  pushRoutes(app);
  fileRoutes(app);

  // Start the worker in-process.
  const boss = await startBoss();
  await registerJobs(boss);

  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Lookback server listening on ${env.port} (storage=${env.storage.driver})`);

  const shutdown = async () => {
    app.log.info('shutting down…');
    await boss.stop({ graceful: true }).catch(() => {});
    await app.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
