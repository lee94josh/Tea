/**
 * `coordinator:check-cluster` + `cluster:moments`.
 *
 * The coordinator waits until every non-screenshot photo has reached a terminal
 * state (done|error) and no moments exist yet, then triggers the one-shot
 * clustering pass. Clustering (MVP, time/distance based):
 *
 *   - exclude screenshots
 *   - sort by taken_at (untimestamped photos bucket separately, deprioritized)
 *   - new moment when gap > 3h OR (both GPS) distance jump > 300m AND the two
 *     photos don't resolve to the same venue (so GPS drift across one dinner
 *     doesn't fragment it, but a few blocks to a different place does split)
 *   - moment time span from photo timestamps; venue/lat/lng from the most common
 *     resolved venue among its photos
 *   - moments with >=2 photos are preferred (single-photo allowed, lower score)
 */

import { query, tx } from '../db';
import { enqueue, JOBS } from '../queue';

const GAP_MS = 3 * 60 * 60 * 1000; // 3 hours
const DIST_M = 300; // ~a few blocks; tighter than before, venue-aware (see below)

interface PhotoRow {
  id: string;
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function runCheckCluster(): Promise<void> {
  const pending = await query<{ n: string }>(
    `select count(*)::text as n from photos
       where is_screenshot = false and ingest_status not in ('done','error')`,
  );
  if (Number(pending.rows[0]?.n ?? '0') > 0) return; // not ready yet

  const existing = await query<{ n: string }>('select count(*)::text as n from moments');
  if (Number(existing.rows[0]?.n ?? '0') > 0) return; // already clustered

  const anyPhotos = await query<{ n: string }>(
    `select count(*)::text as n from photos where is_screenshot = false and ingest_status = 'done'`,
  );
  if (Number(anyPhotos.rows[0]?.n ?? '0') === 0) return; // nothing to do

  await enqueue(JOBS.clusterMoments, {}, { singletonKey: 'cluster-run' });
}

export async function runClusterMoments(): Promise<void> {
  // Re-check idempotency inside the run.
  const existing = await query<{ n: string }>('select count(*)::text as n from moments');
  if (Number(existing.rows[0]?.n ?? '0') > 0) return;

  const res = await query<PhotoRow>(
    `select id, taken_at, lat, lng from photos
       where is_screenshot = false and ingest_status = 'done'`,
  );

  const timestamped = res.rows
    .filter((r) => r.taken_at)
    .sort((a, b) => new Date(a.taken_at!).getTime() - new Date(b.taken_at!).getTime());
  const untimestamped = res.rows.filter((r) => !r.taken_at);

  // Top resolved venue per photo — used so GPS drift within one place doesn't
  // split a moment (the "different coords across one dinner" case).
  const venueByPhoto = new Map<string, string>();
  if (res.rows.length > 0) {
    const vrows = await query<{ photo_id: string; name: string }>(
      `select distinct on (photo_id) photo_id, name from venues
         where name is not null and photo_id = any($1)
         order by photo_id, confidence desc nulls last`,
      [res.rows.map((r) => r.id)],
    );
    for (const v of vrows.rows) venueByPhoto.set(v.photo_id, v.name.trim().toLowerCase());
  }

  // Build groups.
  const groups: PhotoRow[][] = [];
  let current: PhotoRow[] = [];
  let prev: PhotoRow | null = null;
  for (const p of timestamped) {
    if (prev) {
      const gap = new Date(p.taken_at!).getTime() - new Date(prev.taken_at!).getTime();
      const prevVenue = venueByPhoto.get(prev.id);
      const pVenue = venueByPhoto.get(p.id);
      const sameVenue = !!prevVenue && prevVenue === pVenue;
      const farApart =
        !sameVenue &&
        prev.lat != null &&
        prev.lng != null &&
        p.lat != null &&
        p.lng != null &&
        haversine(prev.lat, prev.lng, p.lat, p.lng) > DIST_M;
      if (gap > GAP_MS || farApart) {
        groups.push(current);
        current = [];
      }
    }
    current.push(p);
    prev = p;
  }
  if (current.length) groups.push(current);

  // Untimestamped photos: each becomes its own deprioritized single-photo group.
  for (const p of untimestamped) groups.push([p]);

  const momentIds: string[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const id = await createMoment(group);
    momentIds.push(id);
  }

  // Kick off analysis per moment.
  for (const id of momentIds) {
    await enqueue(JOBS.analyzeMoment, { momentId: id });
  }
}

async function createMoment(group: PhotoRow[]): Promise<string> {
  const photoIds = group.map((p) => p.id);
  const times = group.map((p) => p.taken_at).filter((t): t is string => !!t).sort();
  const startedAt = times[0] ?? null;
  const endedAt = times[times.length - 1] ?? null;

  // Centroid of available GPS.
  const withGps = group.filter((p) => p.lat != null && p.lng != null);
  const lat = withGps.length
    ? withGps.reduce((s, p) => s + (p.lat as number), 0) / withGps.length
    : null;
  const lng = withGps.length
    ? withGps.reduce((s, p) => s + (p.lng as number), 0) / withGps.length
    : null;

  // Most common / highest-confidence resolved venue among the photos.
  const venue = await query<{ name: string }>(
    `select v.name, count(*) c, max(v.confidence) conf
       from venues v
       where v.photo_id = any($1) and v.name is not null
       group by v.name
       order by c desc, conf desc nulls last
       limit 1`,
    [photoIds],
  );
  const venueName = venue.rows[0]?.name ?? null;

  return tx(async (client) => {
    const ins = await client.query<{ id: string }>(
      `insert into moments (started_at, ended_at, venue_name, lat, lng, status)
       values ($1,$2,$3,$4,$5,'pending') returning id`,
      [startedAt, endedAt, venueName, lat, lng],
    );
    const momentId = ins.rows[0]!.id;
    for (const pid of photoIds) {
      await client.query(
        `insert into moment_photos (moment_id, photo_id) values ($1,$2)
         on conflict do nothing`,
        [momentId, pid],
      );
    }
    return momentId;
  });
}
