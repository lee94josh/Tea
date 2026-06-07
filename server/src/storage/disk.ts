import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../env';
import type { Storage } from './index';

/**
 * Local-disk storage. URLs point back at the server's own `/files/:key` proxy
 * route (see routes/files.ts), so the web app can render them like any other
 * served asset. Suitable for a single-user deployment on a persistent volume.
 */
export class DiskStorage implements Storage {
  private root = resolve(env.storage.diskPath);

  private path(key: string): string {
    // Defend against path traversal in keys.
    const safe = key.replace(/\.\.(\/|\\)/g, '');
    return join(this.root, safe);
  }

  async put(key: string, body: Buffer): Promise<string> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async url(key: string): Promise<string> {
    // Carry the token so <img>/fetch (which can't set headers) pass auth.
    return `${env.publicBaseUrl}/files/${encodeURIComponent(key)}?token=${encodeURIComponent(env.appToken)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}
