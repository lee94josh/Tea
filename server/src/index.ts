/**
 * Lookback server — Fastify HTTP API + in-process pg-boss worker.
 * One long-running container hosts both (analysis jobs are long-running, so this
 * is deliberately NOT serverless).
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { env } from './env';
import { pool } from './db';
import { startBoss, enqueue, JOBS } from './queue';
import { registerJobs } from './jobs/index';
import { uploadRoutes } from './routes/upload';
import { statusRoutes } from './routes/status';
import { seedRoutes } from './routes/seeds';
import { conversationRoutes } from './routes/conversations';
import { pushRoutes } from './routes/push';
import { fileRoutes } from './routes/files';
import { debugRoutes } from './routes/debug';
import { adminRoutes } from './routes/admin';
import { feedRoutes } from './routes/feed';
import { discoverRoutes } from './routes/discover';
import { factsRoutes } from './routes/facts';
import { articleRoutes } from './routes/articles';
import { pipelineRoutes } from './routes/pipeline';

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
  debugRoutes(app);
  adminRoutes(app);
  feedRoutes(app);
  discoverRoutes(app);
  factsRoutes(app);
  articleRoutes(app);
  pipelineRoutes(app);

  // Single-origin deploy: serve the built PWA from this server when web/dist
  // exists (no separate static host, no CORS, PWA + API + images on one HTTPS
  // origin — exactly what iOS Safari wants).
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = process.env.WEB_DIST ?? join(here, '..', '..', 'web', 'dist');
  if (existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.log.info(`serving PWA from ${webDist}`);
  }

  // Start the worker in-process.
  const boss = await startBoss();
  await registerJobs(boss);

  // Kick the article drain so any backlog (e.g. after a restart) keeps writing
  // without waiting for the app to hit /articles.
  await enqueue(JOBS.articleCoordinator, {}, { singletonKey: 'article-coord' }).catch(() => {});

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
