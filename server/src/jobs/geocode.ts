/**
 * `ingest:geocode` — resolve a venue for photos that have GPS. Runs in parallel
 * with derivatives and does NOT gate completion (a photo can be `done` without a
 * resolved venue). Skips entirely when there's no GPS or no Places key.
 */

import { query } from '../db';
import { geocode } from '../integrations/geocode';

export interface GeocodeJob {
  photoId: string;
  lat: number;
  lng: number;
}

export async function runGeocode(data: GeocodeJob): Promise<void> {
  const { photoId, lat, lng } = data;
  if (lat == null || lng == null) return;

  const candidates = await geocode().nearbyVenues(lat, lng);
  if (candidates.length === 0) return;

  // Store top candidates — clustering picks the venue name, and the vision
  // model gets the full list to disambiguate against what's in the photo.
  for (const c of candidates.slice(0, 6)) {
    await query(
      `insert into venues (photo_id, name, category, address, place_id, confidence, source)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [photoId, c.name, c.category, c.address, c.placeId, c.confidence, c.source],
    );
  }
}
