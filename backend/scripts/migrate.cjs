const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('pg');

async function main() {
  if (!process.env.DIRECT_DATABASE_URL) throw new Error('DIRECT_DATABASE_URL_REQUIRED');
  const url = new URL(process.env.DIRECT_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname.includes('-pooler')) {
    throw new Error('DIRECT_POSTGRES_CONNECTION_REQUIRED');
  }
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000,
    statement_timeout: 60000 });
  await client.connect();
  try {
    // Session lock requires a direct connection, not transaction-mode pooling.
    await client.query('SELECT pg_advisory_lock(6666001)');
    await client.query(`CREATE TABLE IF NOT EXISTS public.sixtysix_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = path.join(__dirname, '../db');
    const names = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of names) {
      const source = await readFile(path.join(directory, name), 'utf8');
      const digest = createHash('sha256').update(source).digest('hex');
      const existing = await client.query('SELECT sha256 FROM public.sixtysix_migrations WHERE name=$1', [name]);
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== digest) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
        console.log(`unchanged: ${name}`);
        continue;
      }
      // The standalone SQL is transaction-wrapped for psql. Move exactly that
      // outer wrapper here so schema changes and the migration ledger commit together.
      if ((source.match(/^BEGIN;$/gm) ?? []).length !== 1 || !/\nCOMMIT;\s*$/.test(source)) {
        throw new Error('INVALID_MIGRATION_WRAPPER');
      }
      const sql = source.replace(/^BEGIN;\r?\n/m, '').replace(/\nCOMMIT;\s*$/, '\n');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.sixtysix_migrations(name,sha256) VALUES ($1,$2)', [name,digest]);
        await client.query('COMMIT');
        console.log(`applied: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    // Closing releases advisory locks, including after a failed migration.
    await client.end();
  }
}
main().catch(error => {
  // SQL/connection errors can contain secrets: expose codes, not raw messages.
  const safe = ['DIRECT_DATABASE_URL_REQUIRED','DIRECT_POSTGRES_CONNECTION_REQUIRED',
    'MIGRATION_CHECKSUM_MISMATCH','INVALID_MIGRATION_WRAPPER'];
  console.error(safe.includes(error.message) ? error.message : `MIGRATION_FAILED (${error.code ?? 'UNKNOWN'})`);
  process.exitCode = 1;
});
