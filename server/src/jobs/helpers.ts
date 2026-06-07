import { query } from '../db';

export async function markError(photoId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await query(`update photos set ingest_status = 'error', ingest_error = $2 where id = $1`, [
    photoId,
    message.slice(0, 1000),
  ]);
}

/** Advance a photo's status (only relevant ones; no validation here). */
export async function setStatus(photoId: string, status: string): Promise<void> {
  await query('update photos set ingest_status = $2 where id = $1', [photoId, status]);
}
