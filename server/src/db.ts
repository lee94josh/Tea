import pg from 'pg';
import pgvector from 'pgvector/pg';
import { env } from './env';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

// Register pgvector type parsing on every new connection. The extension is
// optional (embeddings are best-effort); warn once, not per-connection.
let warnedNoVector = false;
pool.on('connect', (client) => {
  pgvector.registerType(client).catch(() => {
    if (!warnedNoVector) {
      warnedNoVector = true;
      console.warn('[db] pgvector not installed — embeddings disabled (MVP unaffected)');
    }
  });
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

/** Run fn inside a transaction, rolling back on throw. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
