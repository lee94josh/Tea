/**
 * Object storage abstraction. Two drivers:
 *   - disk: local persistent volume (fine for n=1)
 *   - r2:   Cloudflare R2 (S3-compatible), no egress fees
 *
 * Requirement 1 invariant: originals are written ONCE and never mutated.
 * Derivatives are always written under separate keys. Nothing here ever
 * overwrites an `originals/...` key.
 */

import { env } from '../env';
import { DiskStorage } from './disk';
import { R2Storage } from './r2';

export interface Storage {
  /** Persist bytes at `key`. Returns the key. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Read bytes back (needed for EXIF-from-original and derivative creation). */
  get(key: string): Promise<Buffer>;
  /** A URL the browser can fetch for `key` (signed for R2, proxied for disk). */
  url(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

let _storage: Storage | null = null;

export function storage(): Storage {
  if (_storage) return _storage;
  _storage = env.storage.driver === 'r2' ? new R2Storage() : new DiskStorage();
  return _storage;
}

// Key helpers — keep originals strictly separated from derivatives.
export const keys = {
  original: (photoId: string, ext: string) => `originals/${photoId}.${ext}`,
  vision: (photoId: string) => `vision/${photoId}.jpg`,
  thumb: (photoId: string) => `thumb/${photoId}.jpg`,
};
