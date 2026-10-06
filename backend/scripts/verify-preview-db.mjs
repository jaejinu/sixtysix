// Read-only repository/API probe. Run with the pulled Preview env, using tsx
// from sixtysix-v2: node --env-file=<private-file> --import tsx ../backend/scripts/verify-preview-db.mjs
import assert from 'node:assert/strict';
import { createApp } from '../../sixtysix-v2/server/app.ts';
import { getPool } from '../../sixtysix-v2/server/database.ts';
import { createRequire } from 'node:module';
const { verifyRuntime } = createRequire(import.meta.url)('./verify-runtime.cjs');

if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL_REQUIRED');
const app = createApp();
try {
  assert.equal((await app.inject('/v1/ready')).statusCode, 200);
  const response = await app.inject('/v1/habits');
  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.json().items));
  await getPool().query(`SELECT token_hash,user_id,expires_at,reauthenticated_at,revoked_at
    FROM sixtysix.auth_sessions LIMIT 0`);
  await getPool().query('SELECT provider,subject,disabled_at FROM sixtysix.auth_identities LIMIT 0');
  await getPool().query('SELECT purpose,browser_binding_hash,session_binding_hash,link_intent_id FROM sixtysix.auth_proofs LIMIT 0');
  await getPool().query('SELECT code_hash,browser_binding_hash,attempts,delivery_state FROM sixtysix.email_challenges LIMIT 0');
  await getPool().query('SELECT bucket_key,hits,expires_at FROM sixtysix.auth_rate_limits LIMIT 0');
  await getPool().query('SELECT purpose,provider,session_binding_hash,proof_id FROM sixtysix.auth_intents LIMIT 0');
  await getPool().query('SELECT state_hash,browser_binding_hash,intent_id FROM sixtysix.oauth_states LIMIT 0');
  const role=(await getPool().query('SELECT current_user AS name')).rows[0].name;
  await verifyRuntime(getPool(),role);
  console.log('PASS: remote readiness, catalog API, auth schema and runtime privilege boundary (read-only)');
} catch {
  console.error('PREVIEW_DATABASE_CHECK_FAILED');
  process.exitCode = 1;
} finally {
  await app.close();
  await getPool().end();
}
