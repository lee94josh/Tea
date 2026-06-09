/**
 * Canonical EXIF extraction — Requirement 1 (zero metadata loss).
 *
 * This is the SINGLE implementation used by both the server's `ingest:exif`
 * job and the day-0 validation harness (`scripts/check-exif.ts`). Keeping one
 * code path is deliberate: the harness must prove the *exact* extraction the
 * server runs, not a parallel copy that could drift.
 *
 * Rules enforced here:
 *  - Read EXIF directly from the ORIGINAL bytes (HEIC included) — never from a
 *    converted derivative, which can silently drop GPS/orientation tags.
 *  - Extract GPS, DateTimeOriginal, camera make/model, and dimensions.
 *  - Retain the full raw EXIF object for safety/debugging.
 */

import exifr from 'exifr';

export interface ExtractedExif {
  takenAt: Date | null;
  lat: number | null;
  lng: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  width: number | null;
  height: number | null;
  isScreenshot: boolean;
  /** Full parsed EXIF for persistence into `photos.exif_raw`. */
  raw: Record<string, unknown>;
}

/**
 * Common phone screen aspect ratios (w:h, orientation-agnostic).
 * Deliberately EXCLUDES 4:3 and 3:2 — those are camera sensor ratios, so
 * including them mass-flags real photos whose EXIF was stripped in transit
 * (no GPS + no camera make + 4:3 ≈ every iPhone photo). An iPad screenshot
 * slipping through is far cheaper than a real photo being dropped from moments.
 */
const SCREEN_ASPECTS = [
  19.5 / 9, // modern iPhone
  20 / 9, // many Androids
  16 / 9, // older phones
];

function approxAspectMatch(width: number, height: number): boolean {
  if (!width || !height) return false;
  const a = Math.max(width, height) / Math.min(width, height);
  return SCREEN_ASPECTS.some((target) => Math.abs(a - target) < 0.02);
}

/**
 * Screenshot heuristic, factored out so the derivatives step can re-evaluate it
 * with TRUE pixel dimensions from sharp (iOS screenshots are PNGs with no EXIF,
 * so EXIF-derived dimensions are often null). Conservative: a false positive
 * silently drops a real photo from moment formation.
 */
export function evaluateScreenshot(args: {
  lat: number | null;
  lng: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  width: number | null;
  height: number | null;
}): boolean {
  return (
    args.lat === null &&
    args.lng === null &&
    args.cameraMake === null &&
    args.cameraModel === null &&
    args.width !== null &&
    args.height !== null &&
    approxAspectMatch(args.width, args.height)
  );
}

function toNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Extract metadata from the ORIGINAL image bytes.
 *
 * @param input Buffer/Uint8Array of the untouched original file.
 */
export async function extractExif(input: Buffer | Uint8Array): Promise<ExtractedExif> {
  // Parse the full tag set. `gps: true` + `translateValues` give us decimal
  // lat/lng. We ask exifr for everything so `exif_raw` is a faithful record.
  let raw: Record<string, unknown> = {};
  try {
    // `true` = parse every segment (incl. GPS), merged. exifr's defaults already
    // translate keys/values and revive DateTimeOriginal into a Date.
    raw = ((await exifr.parse(input as Buffer, true)) as Record<string, unknown>) ?? {};
  } catch {
    // A corrupt or tagless file must NOT crash ingest; we record empties.
    raw = {};
  }

  // GPS — exifr surfaces decimal `latitude`/`longitude` when present.
  let lat = toNumber(raw.latitude);
  let lng = toNumber(raw.longitude);
  if (lat === null || lng === null) {
    // Fallback: dedicated GPS parse in case mergeOutput missed it.
    try {
      const gps = await exifr.gps(input as Buffer);
      if (gps) {
        lat = toNumber(gps.latitude);
        lng = toNumber(gps.longitude);
      }
    } catch {
      /* leave null */
    }
  }

  // Timestamp — prefer DateTimeOriginal, fall back to CreateDate/DateTime.
  const takenAtRaw =
    raw.DateTimeOriginal ?? raw.CreateDate ?? raw.DateTimeDigitized ?? raw.ModifyDate ?? null;
  let takenAt: Date | null = null;
  if (takenAtRaw instanceof Date && !Number.isNaN(takenAtRaw.getTime())) {
    takenAt = takenAtRaw;
  } else if (typeof takenAtRaw === 'string') {
    const d = new Date(takenAtRaw);
    if (!Number.isNaN(d.getTime())) takenAt = d;
  }

  const cameraMake = toStr(raw.Make);
  const cameraModel = toStr(raw.Model);

  const width =
    toNumber(raw.ExifImageWidth) ?? toNumber(raw.ImageWidth) ?? toNumber(raw.PixelXDimension);
  const height =
    toNumber(raw.ExifImageHeight) ?? toNumber(raw.ImageHeight) ?? toNumber(raw.PixelYDimension);

  // Screenshot heuristic: no GPS AND no camera make/model AND dims look like a
  // screen. Re-evaluated authoritatively in the derivatives step with true
  // pixel dimensions (EXIF dims are often absent on PNG screenshots).
  const isScreenshot = evaluateScreenshot({ lat, lng, cameraMake, cameraModel, width, height });

  return {
    takenAt,
    lat,
    lng,
    cameraMake,
    cameraModel,
    width,
    height,
    isScreenshot,
    raw,
  };
}
