/**
 * Day-0 metadata validation harness  (BUILD ORDER STEP 0 — ship nothing else
 * until this proves GPS survives on YOUR real photos).
 *
 * Point it at a folder of ~20 real iPhone photos (mix of HEIC + JPEG, some with
 * location, some without). It runs the *exact* server-side EXIF extraction path
 * (`@lookback/shared/exif`) and prints a table:
 *
 *     filename | format | taken_at | lat,lng | screenshot?
 *
 * Plus the same metadata-health summary the /status endpoint will report, so you
 * can eyeball GPS retention before a single byte of pipeline gets built.
 *
 * Usage:
 *   pnpm check-exif                         # defaults to ./scripts/test-assets
 *   pnpm check-exif /path/to/your/photos
 *   pnpm check-exif /path/to/photos --json  # machine-readable output
 *
 * Exit code is non-zero if any file that *has* GPS in its bytes failed to yield
 * lat/lng — i.e. a real metadata-loss regression, suitable for CI.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, basename } from 'node:path';
import exifr from 'exifr';
import { extractExif } from '@lookback/shared/exif';

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
  '.tif',
  '.tiff',
  '.dng',
]);

interface Row {
  filename: string;
  format: string;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
  screenshot: boolean;
  /** True if raw bytes clearly contain GPS but extraction returned none. */
  gpsLoss: boolean;
  error?: string;
}

function fmt(v: string | null | undefined, width: number): string {
  const s = v ?? '—';
  return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width);
}

/**
 * Independent ground-truth check: does the file's raw bytes contain GPS at all?
 * If yes but our extractExif() returned no lat/lng, that's a true loss bug.
 */
async function rawHasGps(buf: Buffer): Promise<boolean> {
  try {
    const gps = await exifr.gps(buf);
    return !!(gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude));
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dirArg = args.find((a) => !a.startsWith('--'));
  const dir = resolve(dirArg ?? join(process.cwd(), 'test-assets'));

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.error(`✗ Cannot read directory: ${dir}`);
    console.error(`  Put ~20 real photos there, or pass a path: pnpm check-exif /path/to/photos`);
    process.exit(2);
  }

  const files = entries.filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()));
  if (files.length === 0) {
    console.error(`✗ No image files found in ${dir}`);
    process.exit(2);
  }

  const rows: Row[] = [];
  for (const f of files.sort()) {
    const path = join(dir, f);
    try {
      const s = await stat(path);
      if (!s.isFile()) continue;
      const buf = await readFile(path);
      const [exif, hadGps] = await Promise.all([extractExif(buf), rawHasGps(buf)]);
      const gotGps = exif.lat !== null && exif.lng !== null;
      rows.push({
        filename: basename(f),
        format: extname(f).slice(1).toUpperCase(),
        takenAt: exif.takenAt ? exif.takenAt.toISOString() : null,
        lat: exif.lat,
        lng: exif.lng,
        screenshot: exif.isScreenshot,
        gpsLoss: hadGps && !gotGps,
      });
    } catch (err) {
      rows.push({
        filename: basename(f),
        format: extname(f).slice(1).toUpperCase(),
        takenAt: null,
        lat: null,
        lng: null,
        screenshot: false,
        gpsLoss: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Health summary — same shape as the /status endpoint's metadata report.
  const total = rows.length;
  const withGps = rows.filter((r) => r.lat !== null && r.lng !== null).length;
  const withTimestamp = rows.filter((r) => r.takenAt !== null).length;
  const withNeither = rows.filter((r) => r.lat === null && r.takenAt === null).length;
  const screenshots = rows.filter((r) => r.screenshot).length;
  const losses = rows.filter((r) => r.gpsLoss);

  if (json) {
    console.log(
      JSON.stringify(
        {
          dir,
          rows,
          summary: { total, withGps, withTimestamp, withNeither, screenshots, gpsLoss: losses.length },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nScanned ${total} files in ${dir}\n`);
    console.log(
      `  ${fmt('FILENAME', 28)} ${fmt('FMT', 5)} ${fmt('TAKEN_AT', 25)} ${fmt('LAT,LNG', 24)} SCRN`,
    );
    console.log('  ' + '─'.repeat(92));
    for (const r of rows) {
      const coords =
        r.lat !== null && r.lng !== null ? `${r.lat.toFixed(5)},${r.lng.toFixed(5)}` : null;
      const flag = r.error ? '  ⚠ ' : r.gpsLoss ? ' ⛔ ' : r.screenshot ? '  📱' : '   ';
      console.log(
        `  ${fmt(r.filename, 28)} ${fmt(r.format, 5)} ${fmt(r.takenAt, 25)} ${fmt(coords, 24)}${flag}`,
      );
      if (r.error) console.log(`      ↳ error: ${r.error}`);
    }
    console.log('\n  Metadata health');
    console.log('  ' + '─'.repeat(40));
    console.log(`  total photos      ${total}`);
    console.log(`  with GPS          ${withGps}  (${pct(withGps, total)}%)`);
    console.log(`  with timestamp    ${withTimestamp}  (${pct(withTimestamp, total)}%)`);
    console.log(`  with neither      ${withNeither}`);
    console.log(`  screenshots       ${screenshots}`);
    console.log('');
  }

  if (losses.length > 0) {
    console.error(
      `✗ GPS LOSS DETECTED on ${losses.length} file(s): ${losses
        .map((r) => r.filename)
        .join(', ')}`,
    );
    console.error('  These files have GPS in their bytes but extraction lost it. Fix before shipping.');
    process.exit(1);
  }

  console.log('✓ Zero GPS loss: every file that has GPS in its bytes retained lat/lng.\n');
}

function pct(n: number, d: number): string {
  return d === 0 ? '0' : ((n / d) * 100).toFixed(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
