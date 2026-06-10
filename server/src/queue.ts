/**
 * pg-boss queue — the worker runs in-process alongside the Fastify API
 * (no Redis for MVP). Job names and the boss lifecycle live here; handlers are
 * registered in jobs/index.ts.
 */

import PgBoss from 'pg-boss';
import { env } from './env';

export const JOBS = {
  exif: 'ingest:exif',
  geocode: 'ingest:geocode',
  derivatives: 'ingest:derivatives',
  embed: 'ingest:embed',
  clusterMoments: 'cluster:moments',
  analyzeMoment: 'analyze:moment',
  researchMoment: 'research:moment',
  seedGenerate: 'seed:generate',
  notifyPush: 'notify:push',
  // Coordinators that fire batch stages once per-item work completes.
  checkCluster: 'coordinator:check-cluster',
  checkNotify: 'coordinator:check-notify',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

let _boss: PgBoss | null = null;

export async function startBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  const boss = new PgBoss({ connectionString: env.databaseUrl });
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
  for (const name of Object.values(JOBS)) {
    await boss.createQueue(name);
  }
  _boss = boss;
  return boss;
}

export function boss(): PgBoss {
  if (!_boss) throw new Error('pg-boss not started');
  return _boss;
}

/** Enqueue a job (thin wrapper for readability + typing).
 *  Default retries with backoff so transient model-API failures (429s, blips)
 *  re-run instead of stranding a photo/moment in `error`. */
export async function enqueue<T extends object>(
  name: JobName,
  data: T,
  options?: PgBoss.SendOptions,
): Promise<void> {
  await boss().send(name, data, {
    retryLimit: 4,
    retryDelay: 20,
    retryBackoff: true,
    ...options,
  });
}
