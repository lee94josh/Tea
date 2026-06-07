/** Minimal forward-only migration runner. Applies server/migrations/*.sql in
 *  filename order, tracking applied files in a `_migrations` table. */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

async function main() {
  await pool.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz default now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await pool.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`• skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`→ applying ${file}`);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migrations up to date.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
