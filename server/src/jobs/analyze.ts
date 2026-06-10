/**
 * `analyze:moment` — Requirement 2. Feed ALL of a moment's vision derivatives
 * plus grounding context (venue, date, location) to the VLM in ONE call and
 * store the structured JSON. Then enqueue seed generation.
 */

import { query } from '../db';
import { storage } from '../storage';
import { vision } from '../integrations/vision';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';

export interface AnalyzeJob {
  momentId: string;
}

function humanDate(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function runAnalyze(data: AnalyzeJob): Promise<void> {
  const { momentId } = data;

  const moment = await query<{
    started_at: string | null;
    venue_name: string | null;
    lat: number | null;
    lng: number | null;
  }>('select started_at, venue_name, lat, lng from moments where id = $1', [momentId]);
  const m = moment.rows[0];
  if (!m) return;

  if (!env.gemini.apiKey) {
    await query(`update moments set status = 'error' where id = $1`, [momentId]);
    console.warn(`[analyze] GEMINI_API_KEY unset — cannot analyze moment ${momentId}`);
    return;
  }

  // Pull vision derivatives for every photo in the moment (cap to keep the call
  // reasonable; the most informative frames dominate anyway).
  const photos = await query<{ vision_key: string | null }>(
    `select p.vision_key from moment_photos mp
       join photos p on p.id = mp.photo_id
       where mp.moment_id = $1 and p.vision_key is not null
       order by p.taken_at nulls last
       limit 12`,
    [momentId],
  );

  // Nearby venue candidates from GPS — vision disambiguates by what's visible.
  const candidates = await query<{ name: string | null; category: string | null }>(
    `select distinct v.name, v.category
       from moment_photos mp join venues v on v.photo_id = mp.photo_id
       where mp.moment_id = $1 and v.name is not null
       limit 8`,
    [momentId],
  );

  const images = [];
  for (const row of photos.rows) {
    if (!row.vision_key) continue;
    const bytes = await storage().get(row.vision_key);
    images.push({ bytes, mimeType: 'image/jpeg' });
  }
  if (images.length === 0) {
    await query(`update moments set status = 'error' where id = $1`, [momentId]);
    return;
  }

  try {
    const analysis = await vision().analyzeMoment(images, {
      venueName: m.venue_name,
      date: humanDate(m.started_at),
      lat: m.lat,
      lng: m.lng,
      venueCandidates: candidates.rows,
    });

    // Vision's visually-grounded venue pick beats the raw "closest place" name.
    const guess = analysis.venue_guess;
    const venueName =
      guess?.name && guess.confidence >= 0.5 ? guess.name : m.venue_name;

    await query(
      `update moments set title = $2, analysis = $3, venue_name = $4, status = 'analyzed'
        where id = $1`,
      [momentId, analysis.title, JSON.stringify(analysis), venueName],
    );

    // Research before seeding — slow is fine, the pipeline is async.
    await enqueue(JOBS.researchMoment, { momentId });
  } catch (err) {
    await query(`update moments set status = 'error' where id = $1`, [momentId]);
    throw err;
  }
}
