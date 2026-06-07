/** Registers all pg-boss job handlers. Called once at server startup. */

import type PgBoss from 'pg-boss';
import { JOBS } from '../queue';
import { runExif } from './exif';
import { runDerivatives } from './derivatives';
import { runGeocode } from './geocode';
import { runEmbed } from './embed';
import { runCheckCluster, runClusterMoments } from './cluster';
import { runAnalyze } from './analyze';
import { runSeed } from './seed';
import { runCheckNotify, runNotifyPush } from './notify';

/**
 * pg-boss v10 delivers a batch (array) of jobs to each worker. This wrapper
 * runs our per-job handler over each item with consistent error logging.
 */
function register<T>(
  boss: PgBoss,
  name: string,
  fn: (data: T) => Promise<void>,
  options?: PgBoss.WorkOptions,
): Promise<string> {
  return boss.work<T>(name, options ?? {}, async (jobs) => {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of list) {
      await fn((job as { data: T }).data);
    }
  });
}

export async function registerJobs(boss: PgBoss): Promise<void> {
  // Per-photo jobs can run with some concurrency.
  await register(boss, JOBS.exif, runExif, { batchSize: 1 });
  await register(boss, JOBS.derivatives, runDerivatives, { batchSize: 1 });
  await register(boss, JOBS.geocode, runGeocode, { batchSize: 1 });
  await register(boss, JOBS.embed, runEmbed, { batchSize: 1 });

  // Coordinators + batch stages — keep these single-flight.
  await register(boss, JOBS.checkCluster, runCheckCluster, { batchSize: 1 });
  await register(boss, JOBS.clusterMoments, runClusterMoments, { batchSize: 1 });
  await register(boss, JOBS.analyzeMoment, runAnalyze, { batchSize: 1 });
  await register(boss, JOBS.seedGenerate, runSeed, { batchSize: 1 });
  await register(boss, JOBS.checkNotify, runCheckNotify, { batchSize: 1 });
  await register(boss, JOBS.notifyPush, runNotifyPush, { batchSize: 1 });
}
