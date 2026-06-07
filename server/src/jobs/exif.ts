/**
 * `ingest:exif` — THE FIRST server-side step on an uploaded file
 * (Requirement 1). Reads EXIF from the ORIGINAL bytes (HEIC included) before
 * any derivative exists, persists everything immediately, then fans out to
 * geocode + derivatives.
 */

import { extractExif } from '@lookback/shared/exif';
import { query } from '../db';
import { storage } from '../storage';
import { enqueue, JOBS } from '../queue';
import { markError } from './helpers';

export interface ExifJob {
  photoId: string;
  originalKey: string;
}

export async function runExif(data: ExifJob): Promise<void> {
  const { photoId, originalKey } = data;
  try {
    const bytes = await storage().get(originalKey);
    const exif = await extractExif(bytes);

    await query(
      `update photos set
         taken_at = $2,
         lat = $3,
         lng = $4,
         camera_make = $5,
         camera_model = $6,
         width = $7,
         height = $8,
         is_screenshot = $9,
         exif_raw = $10,
         ingest_status = 'exif'
       where id = $1`,
      [
        photoId,
        exif.takenAt ? exif.takenAt.toISOString() : null,
        exif.lat,
        exif.lng,
        exif.cameraMake,
        exif.cameraModel,
        exif.width,
        exif.height,
        exif.isScreenshot,
        JSON.stringify(exif.raw),
      ],
    );

    // Fan out. Geocode only matters if we have GPS; the job itself no-ops
    // otherwise, but we skip the enqueue to keep the queue clean.
    if (exif.lat != null && exif.lng != null) {
      await enqueue(JOBS.geocode, { photoId, lat: exif.lat, lng: exif.lng });
    }
    await enqueue(JOBS.derivatives, { photoId, originalKey });
  } catch (err) {
    await markError(photoId, err);
    throw err;
  }
}
