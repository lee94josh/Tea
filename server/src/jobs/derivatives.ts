/**
 * `ingest:derivatives` — create NEW files for the VLM and the UI. The original
 * is never touched (Requirement 1). HEIC is decoded via sharp (libvips+libheif),
 * falling back to heic-convert if the platform can't decode it.
 *
 * vision_key: ~2048px long edge, JPEG q85 — don't starve the model of pixels.
 * thumb_key:  ~512px long edge, JPEG q80 — UI only.
 */

import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { evaluateScreenshot } from '@lookback/shared/exif';
import { query } from '../db';
import { storage, keys } from '../storage';
import { enqueue, JOBS } from '../queue';
import { markError } from './helpers';

export interface DerivativesJob {
  photoId: string;
  originalKey: string;
}

const VISION_LONG_EDGE = 2048;
const THUMB_LONG_EDGE = 512;

function isHeic(mime: string, key: string): boolean {
  return /heic|heif/i.test(mime) || /\.hei[cf]$/i.test(key);
}

/** Decode any input (incl. HEIC) into a sharp pipeline source buffer. */
async function toDecodable(bytes: Buffer, mime: string, key: string): Promise<Buffer> {
  if (!isHeic(mime, key)) return bytes;
  try {
    // Prefer sharp/libheif — fastest, keeps a single pipeline.
    await sharp(bytes).metadata();
    return bytes;
  } catch {
    // Fallback: heic-convert produces a JPEG buffer sharp can ingest.
    // (cast: @types/heic-convert types `buffer` as ArrayBufferLike; a Node
    //  Buffer works at runtime.)
    const out = await heicConvert({
      buffer: bytes as unknown as ArrayBufferLike,
      format: 'JPEG',
      quality: 0.92,
    });
    return Buffer.from(out);
  }
}

export async function runDerivatives(data: DerivativesJob): Promise<void> {
  const { photoId, originalKey } = data;
  try {
    const row = await query<{
      mime_original: string;
      lat: number | null;
      lng: number | null;
      camera_make: string | null;
      camera_model: string | null;
    }>('select mime_original, lat, lng, camera_make, camera_model from photos where id = $1', [
      photoId,
    ]);
    const meta = row.rows[0];
    const mime = meta?.mime_original ?? 'application/octet-stream';

    const original = await storage().get(originalKey);
    const decodable = await toDecodable(original, mime, originalKey);

    // True pixel dimensions — authoritative for the screenshot heuristic
    // (EXIF dims are often absent on PNG screenshots).
    const dims = await sharp(decodable).metadata();
    const width = dims.width ?? null;
    const height = dims.height ?? null;
    const isScreenshot = evaluateScreenshot({
      lat: meta?.lat ?? null,
      lng: meta?.lng ?? null,
      cameraMake: meta?.camera_make ?? null,
      cameraModel: meta?.camera_model ?? null,
      width,
      height,
    });

    // .rotate() with no args applies EXIF orientation so derivatives look right.
    const visionBuf = await sharp(decodable)
      .rotate()
      .resize({ width: VISION_LONG_EDGE, height: VISION_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const thumbBuf = await sharp(decodable)
      .rotate()
      .resize({ width: THUMB_LONG_EDGE, height: THUMB_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const visionKey = keys.vision(photoId);
    const thumbKey = keys.thumb(photoId);
    await storage().put(visionKey, visionBuf, 'image/jpeg');
    await storage().put(thumbKey, thumbBuf, 'image/jpeg');

    await query(
      `update photos set
         vision_key = $2, thumb_key = $3,
         width = coalesce($4, width), height = coalesce($5, height),
         is_screenshot = $6,
         ingest_status = 'derived'
       where id = $1`,
      [photoId, visionKey, thumbKey, width, height, isScreenshot],
    );

    await enqueue(JOBS.embed, { photoId, visionKey });
  } catch (err) {
    await markError(photoId, err);
    throw err;
  }
}
