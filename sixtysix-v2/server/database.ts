import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool: Pool | undefined;

export function runtimeConnectionString(env: Record<string,string|undefined> = process.env): string {
  // Marketplace DATABASE_URL may be a schema owner. Never fall back to it.
  const connectionString = env.APP_DATABASE_URL;
  if (!connectionString) throw new Error('APP_DATABASE_NOT_CONFIGURED');
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('INVALID_APP_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      !/^sixtysix_runtime(?:_[a-z0-9_]+)?$/.test(decodeURIComponent(url.username)) ||
      [...url.searchParams.keys()].some(key => !['sslmode','channel_binding','connect_timeout'].includes(key))) {
    throw new Error('INVALID_APP_DATABASE_URL');
  }
  return connectionString;
}

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = runtimeConnectionString();
  pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000, statement_timeout: 10000 });
  // Pool events must not log connection URLs or raw driver errors.
  pool.on('error', () => console.error('DATABASE_IDLE_CONNECTION_ERROR'));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

// A transaction always uses one checked-out client, never pool.query().
export async function inTransaction<T>(
  source: Pick<Pool, 'connect'>,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await source.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}
