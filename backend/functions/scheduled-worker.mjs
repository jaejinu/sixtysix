import pg from 'pg';
import scheduled from '../scripts/run-scheduled-work.cjs';
import privileges from '../scripts/worker-privileges.cjs';
import { createScheduledHandler } from './scheduled-handler.mjs';

let pool;
async function runTick() {
  // Never fall back to Neon's automatically injected owner DATABASE_URL.
  if (!pool) {
    pool = new pg.Pool({ connectionString: scheduled.connectionString(), max: 1,
      connectionTimeoutMillis: 5000, statement_timeout: 10000, idleTimeoutMillis: 10000 });
    pool.on('error', () => console.error('WORKER_IDLE_CONNECTION_CLOSED'));
  }
  const client = await pool.connect();
  let discard = false;
  try {
    await privileges.verifyWorker(client, (await client.query('SELECT current_user AS name')).rows[0].name);
    return await scheduled.runScheduledWork(client, { batch: 20, apply: true });
  } catch (error) { discard = true; throw error; }
  finally { client.release(discard); }
}
export default { fetch: createScheduledHandler({ runTick }) };
