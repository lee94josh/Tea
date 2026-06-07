/**
 * GET /status — analysis progress + the metadata-health report (Requirement 1
 * observability). Reports total photos, % with GPS, % with timestamp, % with
 * neither, counts by ingest_status, moments analyzed, and seeds ready. Also logs
 * the strip-rate line so low GPS coverage is surfaced, not buried.
 */

import type { FastifyInstance } from 'fastify';
import { INGEST_STATUSES, type IngestStatus, type StatusReport } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';

export function statusRoutes(app: FastifyInstance): void {
  app.get('/status', { preHandler: requireAuth }, async () => {
    const metaRow = await query<{
      total: string;
      with_gps: string;
      with_ts: string;
      with_neither: string;
      screenshots: string;
    }>(`
      select
        count(*)::text as total,
        count(*) filter (where lat is not null and lng is not null)::text as with_gps,
        count(*) filter (where taken_at is not null)::text as with_ts,
        count(*) filter (where lat is null and taken_at is null)::text as with_neither,
        count(*) filter (where is_screenshot = true)::text as screenshots
      from photos
    `);
    const meta = metaRow.rows[0]!;
    const total = Number(meta.total);
    const withGps = Number(meta.with_gps);
    const withTimestamp = Number(meta.with_ts);

    const byStatusRows = await query<{ ingest_status: IngestStatus; n: string }>(
      'select ingest_status, count(*)::text as n from photos group by ingest_status',
    );
    const byIngestStatus = Object.fromEntries(
      INGEST_STATUSES.map((s) => [s, 0]),
    ) as Record<IngestStatus, number>;
    for (const r of byStatusRows.rows) {
      if (r.ingest_status in byIngestStatus) byIngestStatus[r.ingest_status] = Number(r.n);
    }

    const momentRow = await query<{ total: string; analyzed: string }>(`
      select count(*)::text as total,
             count(*) filter (where status in ('analyzed','seeded'))::text as analyzed
      from moments
    `);
    const seedRow = await query<{ total: string; ready: string }>(`
      select count(*)::text as total,
             count(*) filter (where status = 'unused')::text as ready
      from conversation_seeds
    `);

    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
    const gpsPct = pct(withGps);
    const timestampPct = pct(withTimestamp);

    // Strip-rate log line — surface low GPS coverage.
    console.log(
      `[status] photos=${total} gps=${withGps}(${gpsPct}%) ts=${withTimestamp}(${timestampPct}%) ` +
        `neither=${meta.with_neither} screenshots=${meta.screenshots}`,
    );

    const uploadingPending =
      byIngestStatus.uploaded + byIngestStatus.exif + byIngestStatus.derived;
    const report: StatusReport = {
      metadata: {
        totalPhotos: total,
        withGps,
        withTimestamp,
        withNeither: Number(meta.with_neither),
        gpsPct,
        timestampPct,
        screenshots: Number(meta.screenshots),
      },
      byIngestStatus,
      moments: {
        total: Number(momentRow.rows[0]!.total),
        analyzed: Number(momentRow.rows[0]!.analyzed),
      },
      seeds: {
        total: Number(seedRow.rows[0]!.total),
        ready: Number(seedRow.rows[0]!.ready),
      },
      pipelineComplete:
        total > 0 &&
        uploadingPending === 0 &&
        byIngestStatus.embedded === 0 &&
        Number(seedRow.rows[0]!.total) > 0,
    };

    return report;
  });
}
