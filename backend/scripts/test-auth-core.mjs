// Runs against a newly created local database, never the supplied database's tables.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { IdentityCore, digest } from '../../sixtysix-v2/server/auth/identity-core.ts';
import { EmailLogin } from '../../sixtysix-v2/server/auth/email-login.ts';
import { createApp } from '../../sixtysix-v2/server/app.ts';
import { readSessionCookie } from '../../sixtysix-v2/server/auth/session-cookie.ts';
import { AuthIntents } from '../../sixtysix-v2/server/auth/auth-intents.ts';
import { KakaoLogin } from '../../sixtysix-v2/server/auth/kakao-login.ts';
import { authAuditContext } from '../../sixtysix-v2/server/auth/audit.ts';
const require = createRequire(new URL('../../sixtysix-v2/package.json', import.meta.url));
const { Pool } = require('pg');
const source = process.env.AUTH_TEST_DATABASE_URL;
if (!source) throw new Error('AUTH_TEST_DATABASE_URL must point to a local PostgreSQL instance with CREATEDB permission');
const url = new URL(source);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    (url.searchParams.has('host') && !url.searchParams.get('host').startsWith('/'))) {
  throw new Error('Only local PostgreSQL is allowed');
}
const database = `sixtysix_auth_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: source, max: 1 });
let pool; let runtimePool; let workerPool; let core;
const workerRole=`sixtysix_worker_${randomUUID().replaceAll('-','')}`;
const workerPassword=randomBytes(32).toString('base64url');
const { configureWorker,verifyWorker }=require('../backend/scripts/worker-privileges.cjs');
const { runOutbox }=require('../backend/scripts/process-outbox.cjs');
const runtimeRole = `sixtysix_runtime_${randomUUID().replaceAll('-', '')}`;
const runtimePassword = randomBytes(32).toString('base64url');
const { configureRuntime } = require('../backend/scripts/runtime-privileges.cjs');
const { verifyRuntime } = require('../backend/scripts/verify-runtime.cjs');
const binding = randomBytes(32).toString('base64url');
const address = () => `${randomUUID()}@example.test`;
const kakao = () => String(BigInt(`0x${randomBytes(8).toString('hex')}`) + 1n);
const rejected = (promise, code) => assert.rejects(promise, error => error.code === code);
async function login(provider = 'email', subject = address()) {
  const proof = await core.recordVerifiedProof({ provider, subject, purpose: 'login', browserBinding: binding });
  return { ...await core.login(proof, binding), subject };
}
async function link(session, provider, subject) {
  const intent = await core.beginLink(session.token, provider);
  const proof = await core.recordVerifiedProof({ provider, subject, purpose: 'link',
    sessionToken: session.token, intentId: intent.id, browserBinding: binding });
  return core.completeLink(session.token, intent.id, proof, binding);
}
before(async () => {
  await admin.query(`CREATE DATABASE "${database}"`);
  url.pathname = `/${database}`;
  pool = new Pool({ connectionString: url.toString(), max: 12, statement_timeout: 5000 });
  for (const name of ['001_initial.sql', '002_auth_core.sql', '003_email_login.sql', '004_auth_intents_oauth.sql','005_runtime_photo_lock.sql','006_auth_cleanup.sql','007_outbox_notifications.sql','008_operator_cohorts.sql','009_scheduled_cohort_launch.sql']) {
    await pool.query(await readFile(new URL(`../db/${name}`, import.meta.url), 'utf8'));
  }
  await pool.query('CREATE TABLE public.sixtysix_migrations(name text PRIMARY KEY,sha256 text NOT NULL)');
  const setup = await pool.connect();
  try { await configureRuntime(setup,runtimeRole,runtimePassword); } finally { setup.release(); }
  const runtimeUrl=new URL(url);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;
  runtimePool=new Pool({connectionString:runtimeUrl.toString(),max:12,statement_timeout:5000});
  const owner=await pool.connect();
  try{await configureWorker(owner,workerRole,workerPassword);}finally{owner.release();}
  const workerUrl=new URL(url);workerUrl.username=workerRole;workerUrl.password=workerPassword;
  workerPool=new Pool({connectionString:workerUrl.toString(),max:8,statement_timeout:5000});
  core = new IdentityCore(runtimePool);
});
after(async () => {
  await workerPool?.end();
  await runtimePool?.end();
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await admin.query(`DROP ROLE IF EXISTS "${workerRole}"`);
  await admin.end();
});

test('email normalization, opaque account ID and hashed sessions', async () => {
  const subject = address();
  const first = await login('email', ` ${subject.toUpperCase()} `);
  const second = await login('email', subject);
  assert.equal(first.userId, second.userId);
  assert.notEqual(first.token, second.token);
  const session = await pool.query('SELECT token_hash FROM sixtysix.auth_sessions WHERE user_id=$1', [first.userId]);
  assert.equal(session.rows.length, 2);
  assert(session.rows.every(row => row.token_hash !== first.token && /^[a-f0-9]{64}$/.test(row.token_hash)));
  assert.equal((await core.session(first.token)).userId, first.userId);
});

test('runtime is a separate login and repeated provisioning preserves exact privileges',async()=>{
  assert.equal((await runtimePool.query('SELECT current_user AS name')).rows[0].name,runtimeRole);
  const setup=await pool.connect();
  try {await configureRuntime(setup,runtimeRole,runtimePassword);await verifyRuntime(setup,runtimeRole);}
  finally {setup.release();}
  await verifyRuntime(runtimePool,runtimeRole);
});

for(const [name,sql]of [
  ['schema DDL','CREATE TABLE sixtysix.runtime_forbidden(id integer)'],
  ['public schema DDL','CREATE TABLE public.runtime_forbidden(id integer)'],
  ['temporary DDL','CREATE TEMP TABLE runtime_forbidden(id integer)'],
  ['alter existing table','ALTER TABLE sixtysix.day_entries ADD COLUMN forbidden text'],
  ['operator role read','SELECT * FROM sixtysix.operator_roles'],
  ['operator promotion',"INSERT INTO sixtysix.operator_roles(user_id,role) VALUES (gen_random_uuid(),'admin')"],
  ['unblock user','UPDATE sixtysix.app_users SET suspended_at=NULL'],
  ['change records',"UPDATE sixtysix.day_entries SET body='changed'"],
  ['delete records','DELETE FROM sixtysix.day_entries'],
  ['erase audit','DELETE FROM sixtysix.audit_events'],
  ['rewrite audit',"UPDATE sixtysix.audit_events SET action='changed'"],
  ['read outbox','SELECT * FROM sixtysix.outbox'],
  ['edit catalog',"UPDATE sixtysix.sample_photos SET public_path='/changed'"],
  ['change capacity','UPDATE sixtysix.cohorts SET capacity=30'],
  ['migration ledger','SELECT * FROM public.sixtysix_migrations'],
  ['truncate','TRUNCATE sixtysix.auth_proofs'],
])test(`runtime denies ${name}`,async()=>{
  const client=await runtimePool.connect();
  try {await client.query('BEGIN');await assert.rejects(client.query(sql),{code:'42501'});}
  finally {await client.query('ROLLBACK');client.release();}
});

test('provision resets stale column grants and future tables remain inaccessible',async()=>{
  const setup=await pool.connect();
  try{
    await setup.query(`GRANT UPDATE(suspended_at) ON sixtysix.app_users TO "${runtimeRole}"`);
    await assert.rejects(verifyRuntime(setup,runtimeRole),/RUNTIME_PRIVILEGE_MISMATCH/);
    await configureRuntime(setup,runtimeRole,runtimePassword);
    await setup.query('CREATE TABLE sixtysix.future_private(secret text)');
    await assert.rejects(runtimePool.query('SELECT * FROM sixtysix.future_private'),{code:'42501'});
    await verifyRuntime(runtimePool,runtimeRole);
  }finally{await setup.query('DROP TABLE IF EXISTS sixtysix.future_private');setup.release();}
});

test('photo lock helper prevents retirement until the runtime transaction finishes',async()=>{
  const ref=randomUUID();await pool.query("INSERT INTO sixtysix.sample_photos(ref,public_path) VALUES ($1,'/test.webp')",[ref]);
  const reader=await runtimePool.connect(),writer=await pool.connect();
  try{
    await reader.query('BEGIN');assert.equal((await reader.query('SELECT sixtysix.lock_active_sample_photo($1) AS ok',[ref])).rows[0].ok,true);
    await writer.query('BEGIN');await writer.query("SET LOCAL lock_timeout='100ms'");
    await assert.rejects(writer.query('UPDATE sixtysix.sample_photos SET retired_at=now() WHERE ref=$1',[ref]),{code:'55P03'});
  }finally{await reader.query('ROLLBACK');await writer.query('ROLLBACK');reader.release();writer.release();}
  await pool.query('UPDATE sixtysix.sample_photos SET retired_at=now() WHERE ref=$1',[ref]);
  assert.equal((await runtimePool.query('SELECT sixtysix.lock_active_sample_photo($1) AS ok',[ref])).rows[0].ok,false);
});

test('runtime verification rejects missing schema objects',async()=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query('DROP FUNCTION sixtysix.lock_active_sample_photo(text)');
    await assert.rejects(verifyRuntime(client,runtimeRole),/RUNTIME_PRIVILEGE_MISMATCH/);
  }finally{await client.query('ROLLBACK');client.release();}
});

test('NOINHERIT does not conceal a role membership from verification',async()=>{
  const group=`runtime_test_group_${randomUUID().replaceAll('-','')}`;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query(`CREATE ROLE "${group}" NOLOGIN`);
    await client.query(`GRANT "${group}" TO "${runtimeRole}"`);
    await assert.rejects(verifyRuntime(client,runtimeRole),/UNSAFE_RUNTIME_ROLE/);
  }finally{await client.query('ROLLBACK');client.release();}
});

test('Kakao without email works and does not acquire an email login implicitly', async () => {
  const social = await login('kakao', kakao());
  const email = await login();
  assert.notEqual(social.userId, email.userId);
  const methods = await pool.query('SELECT provider FROM sixtysix.auth_identities WHERE user_id=$1', [social.userId]);
  assert.deepEqual(methods.rows, [{ provider: 'kakao' }]);
});

test('proof browser/purpose isolation and exactly one success under replay race', async () => {
  const proof = await core.recordVerifiedProof({ provider: 'email', subject: address(), purpose: 'login', browserBinding: binding });
  await rejected(core.login(proof, `${binding}wrong`), 'INVALID_CHALLENGE');
  const results = await Promise.allSettled([core.login(proof, binding), core.login(proof, binding)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'INVALID_CHALLENGE');
});

test('eight concurrent first logins create exactly one account', async () => {
  const subject = address();
  const sessions = await Promise.all(Array.from({ length: 8 }, () => login('email', subject)));
  assert.equal(new Set(sessions.map(s => s.userId)).size, 1);
  assert.equal(new Set(sessions.map(s => s.token)).size, 8);
});

test('explicit email → Kakao link and unlink keep usable email login', async () => {
  const email = await login();
  const subject = kakao();
  const identity = await link(email, 'kakao', subject);
  const social = await login('kakao', subject);
  assert.equal(email.userId, social.userId);
  await core.unlink(email.token, identity.id);
  await rejected(core.session(social.token), 'UNAUTHENTICATED');
  await rejected(login('kakao', subject), 'FORBIDDEN');
  assert.equal((await login('email', email.subject)).userId, email.userId);
  // Owner can explicitly restore the disabled identity.
  await link(email, 'kakao', subject);
  assert.equal((await login('kakao', subject)).userId, email.userId);
});

test('explicit Kakao → email link works without a Kakao email', async () => {
  const social = await login('kakao', kakao());
  const email = address();
  await link(social, 'email', email);
  assert.equal((await login('email', email)).userId, social.userId);
});

test('other account identity cannot be linked or used for reauthentication', async () => {
  const owner = await login('kakao', kakao());
  const other = await login();
  await rejected(link(other, 'kakao', owner.subject), 'IDENTITY_ALREADY_LINKED');
  const proof = await core.recordVerifiedProof({ provider: 'kakao', subject: owner.subject,
    purpose: 'reauth', sessionToken: other.token, browserBinding: binding });
  await rejected(core.reauthenticate(other.token, proof, binding), 'FORBIDDEN');
  assert.equal((await core.session(owner.token)).userId, owner.userId);
});

test('competing link requests for the same identity have exactly one owner', async () => {
  const a = await login(); const b = await login(); const subject = kakao();
  const results = await Promise.allSettled([link(a, 'kakao', subject), link(b, 'kakao', subject)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'IDENTITY_ALREADY_LINKED');
});

test('reauthentication requires the exact session and refreshes only that session', async () => {
  const a = await login(); const b = await login('email', a.subject);
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=now()-interval '6 minutes' WHERE user_id=$1", [a.userId]);
  await rejected(core.beginLink(a.token, 'kakao'), 'REAUTH_REQUIRED');
  const proof = await core.recordVerifiedProof({ provider: 'email', subject: a.subject,
    purpose: 'reauth', sessionToken: a.token, browserBinding: binding });
  await rejected(core.reauthenticate(b.token, proof, binding), 'INVALID_CHALLENGE');
  await rejected(core.login(proof, binding), 'INVALID_CHALLENGE');
  await core.reauthenticate(a.token, proof, binding);
  assert.equal((await core.session(a.token)).recentlyAuthenticated, true);
  assert.equal((await core.session(b.token)).recentlyAuthenticated, false);
  await rejected(core.reauthenticate(a.token, proof, binding), 'INVALID_CHALLENGE');
});

test('link intent is session-bound, expires and requires recent reauth at completion', async () => {
  const a = await login(); const b = await login('email', a.subject);
  const intent = await core.beginLink(a.token, 'kakao');
  const subject = kakao();
  await rejected(core.recordVerifiedProof({ provider: 'kakao', subject, purpose: 'link',
    sessionToken: b.token, intentId: intent.id, browserBinding: binding }), 'INVALID_CHALLENGE');
  const proof = await core.recordVerifiedProof({ provider: 'kakao', subject, purpose: 'link',
    sessionToken: a.token, intentId: intent.id, browserBinding: binding });
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=now()-interval '6 minutes' WHERE token_hash=$1", [digest(a.token)]);
  await rejected(core.completeLink(a.token, intent.id, proof, binding), 'REAUTH_REQUIRED');
  await pool.query('UPDATE sixtysix.auth_sessions SET reauthenticated_at=now() WHERE token_hash=$1', [digest(a.token)]);
  await pool.query("UPDATE sixtysix.link_intents SET created_at=now()-interval '10 minutes', expires_at=now()-interval '1 minute' WHERE id=$1", [intent.id]);
  await rejected(core.completeLink(a.token, intent.id, proof, binding), 'INVALID_CHALLENGE');
});

test('simultaneous unlink requests leave one usable login method', async () => {
  const account = await login();
  const social = await link(account, 'kakao', kakao());
  const email = (await pool.query("SELECT id FROM sixtysix.auth_identities WHERE user_id=$1 AND provider='email'", [account.userId])).rows[0];
  const results = await Promise.allSettled([core.unlink(account.token, social.id), core.unlink(account.token, email.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'LAST_IDENTITY');
  const remaining = await pool.query('SELECT id FROM sixtysix.auth_identities WHERE user_id=$1 AND disabled_at IS NULL', [account.userId]);
  assert.equal(remaining.rowCount, 1);
  await rejected(core.unlink(account.token, remaining.rows[0].id), 'LAST_IDENTITY');
});

test('expired proofs cannot create sessions', async () => {
  const proof = await core.recordVerifiedProof({ provider: 'email', subject: address(), purpose: 'login', browserBinding: binding });
  await pool.query("UPDATE sixtysix.auth_proofs SET created_at=now()-interval '10 minutes',expires_at=now()-interval '6 minutes' WHERE id=$1", [proof]);
  await rejected(core.login(proof, binding), 'INVALID_CHALLENGE');
});

test('logout is idempotent and invalidates the server session', async () => {
  const a = await login();
  await core.logout(a.token); await core.logout(a.token);
  await rejected(core.session(a.token), 'UNAUTHENTICATED');
  await rejected(core.beginLink(a.token, 'email'), 'UNAUTHENTICATED');
  await rejected(core.session('forged'), 'UNAUTHENTICATED');
});

test('expired session and suspended/deletion-requested/anonymized accounts are denied', async () => {
  const expired = await login();
  await pool.query("UPDATE sixtysix.auth_sessions SET created_at=now()-interval '9 days', expires_at=now()-interval '1 day' WHERE token_hash=$1", [digest(expired.token)]);
  await rejected(core.session(expired.token), 'UNAUTHENTICATED');
  for (const column of ['suspended_at', 'deletion_requested_at', 'anonymized_at']) {
    const a = await login();
    await pool.query(`UPDATE sixtysix.app_users SET ${column}=now() WHERE id=$1`, [a.userId]);
    await rejected(core.session(a.token), 'UNAUTHENTICATED');
    await rejected(login('email', a.subject), 'FORBIDDEN');
  }
});

test('completed link proof and intent cannot be replayed', async () => {
  const a = await login();
  const intent = await core.beginLink(a.token, 'kakao');
  const proof = await core.recordVerifiedProof({ provider: 'kakao', subject: kakao(), purpose: 'link',
    sessionToken: a.token, intentId: intent.id, browserBinding: binding });
  await core.completeLink(a.token, intent.id, proof, binding);
  await rejected(core.completeLink(a.token, intent.id, proof, binding), 'INVALID_CHALLENGE');
});

test('unlinked identity remains reserved to its owner and cannot be stolen', async () => {
  const a = await login(); const b = await login(); const subject = kakao();
  const method = await link(a, 'kakao', subject);
  await rejected(core.unlink(b.token, method.id), 'NOT_FOUND');
  await core.unlink(a.token, method.id);
  await rejected(link(b, 'kakao', subject), 'IDENTITY_ALREADY_LINKED');
});

test('transaction failure leaves neither partial account nor consumed proof', async () => {
  const subject = address();
  const proof = await core.recordVerifiedProof({ provider: 'email', subject, purpose: 'login', browserBinding: binding });
  // Force an error after app_users insert, before identity/session insert.
  await pool.query(`CREATE FUNCTION sixtysix.test_abort() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER test_abort BEFORE INSERT ON sixtysix.preferences FOR EACH ROW EXECUTE FUNCTION sixtysix.test_abort()`);
  const beforeCount = Number((await pool.query('SELECT count(*) FROM sixtysix.app_users')).rows[0].count);
  try { await assert.rejects(core.login(proof, binding)); }
  finally { await pool.query('DROP TRIGGER test_abort ON sixtysix.preferences; DROP FUNCTION sixtysix.test_abort()'); }
  assert.equal(Number((await pool.query('SELECT count(*) FROM sixtysix.app_users')).rows[0].count), beforeCount);
  assert.equal((await pool.query('SELECT consumed_at FROM sixtysix.auth_proofs WHERE id=$1', [proof])).rows[0].consumed_at, null);
  assert((await core.login(proof, binding)).userId);
});

const otpSecret = 'test-only-otp-secret-0123456789abcdef0123456789abcdef';
function emailFixture(mailerOverride) {
  const mailbox = new Map();
  const mailer = mailerOverride ?? { send: async input => { mailbox.set(input.id, input); } };
  return { mailbox, service: new EmailLogin(runtimePool, otpSecret, mailer), mailer,
    browser: { binding: randomBytes(32).toString('base64url'), ip: `test-ip-${randomUUID()}` } };
}
test('OTP hash storage and successful verification create a real identity/session', async () => {
  const { service, mailbox, browser } = emailFixture();
  const email = address();
  const challenge = await service.issue(email.toUpperCase(), browser);
  const code = mailbox.get(challenge.challengeId).code;
  assert.match(code, /^\d{6}$/);
  const row = (await pool.query('SELECT * FROM sixtysix.email_challenges WHERE id=$1', [challenge.challengeId])).rows[0];
  assert.equal(row.email, email);
  assert.equal(row.delivery_state, 'sent');
  assert.match(row.code_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.code_hash, digest(code));
  assert.deepEqual(Object.keys(challenge).sort(), ['challengeId','expiresAt','message']);
  const session = await service.verify(challenge.challengeId, code, browser);
  assert.equal((await core.session(session.token)).userId, session.userId);
  await rejected(service.verify(challenge.challengeId, code, browser), 'INVALID_CHALLENGE');
});

test('three wrong OTP attempts persist and permanently exhaust the challenge', async () => {
  const { service, mailbox, browser } = emailFixture();
  const challenge = await service.issue(address(), browser);
  const code = mailbox.get(challenge.challengeId).code;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 3; i++) await rejected(service.verify(challenge.challengeId, wrong, browser), 'INVALID_CHALLENGE');
  assert.equal((await pool.query('SELECT attempts FROM sixtysix.email_challenges WHERE id=$1', [challenge.challengeId])).rows[0].attempts, 3);
  await rejected(service.verify(challenge.challengeId, code, browser), 'INVALID_CHALLENGE');
});

test('wrong browser cannot consume a code or exhaust the owner attempts', async () => {
  const { service, mailbox, browser } = emailFixture();
  const challenge = await service.issue(address(), browser);
  const code = mailbox.get(challenge.challengeId).code;
  await rejected(service.verify(challenge.challengeId, code, { ...browser, binding: `${browser.binding}other` }), 'INVALID_CHALLENGE');
  assert.equal((await pool.query('SELECT attempts FROM sixtysix.email_challenges WHERE id=$1', [challenge.challengeId])).rows[0].attempts, 0);
  assert((await service.verify(challenge.challengeId, code, browser)).token);
});

test('concurrent correct codes across service instances create only one session', async () => {
  const { service, mailbox, browser, mailer } = emailFixture();
  const email = address(); const challenge = await service.issue(email, browser);
  const code = mailbox.get(challenge.challengeId).code;
  const another = new EmailLogin(runtimePool, otpSecret, mailer);
  const results = await Promise.allSettled([service.verify(challenge.challengeId, code, browser), another.verify(challenge.challengeId, code, browser)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'INVALID_CHALLENGE');
});

test('expired OTP is rejected', async () => {
  const { service, mailbox, browser } = emailFixture();
  const challenge = await service.issue(address(), browser);
  await pool.query("UPDATE sixtysix.email_challenges SET created_at=now()-interval '10 minutes', expires_at=now()-interval '6 minutes' WHERE id=$1", [challenge.challengeId]);
  await rejected(service.verify(challenge.challengeId, mailbox.get(challenge.challengeId).code, browser), 'INVALID_CHALLENGE');
});

test('pending delivery cannot authenticate and successful provider acceptance enables verification', async () => {
  let release; let started; let sent;
  const waiting = new Promise(resolve => { release = resolve; });
  const begun = new Promise(resolve => { started = resolve; });
  const { service, browser } = emailFixture({ send: async input => { sent = input; started(); await waiting; } });
  const issuing = service.issue(address(), browser);
  await begun;
  try { await rejected(service.verify(sent.id, sent.code, browser), 'INVALID_CHALLENGE'); }
  finally { release(); }
  await issuing;
  assert((await service.verify(sent.id, sent.code, browser)).token);
});

test('delivery failure fails closed without leaking provider errors', async () => {
  let sent;
  const { service, browser } = emailFixture({ send: async input => { sent = input; throw new Error('private-address-and-key'); } });
  await rejected(service.issue(address(), browser), 'TEMPORARILY_UNAVAILABLE');
  assert.equal((await pool.query('SELECT delivery_state FROM sixtysix.email_challenges WHERE id=$1', [sent.id])).rows[0].delivery_state, 'failed');
  await rejected(service.verify(sent.id, sent.code, browser), 'INVALID_CHALLENGE');
});

test('concurrent sends share normalized email cooldown across instances and browsers', async () => {
  const { service, browser, mailbox, mailer } = emailFixture();
  const other = new EmailLogin(runtimePool, otpSecret, mailer);
  const email = address();
  const results = await Promise.allSettled([service.issue(email, browser), other.issue(email.toUpperCase(), { ...browser, binding: `${browser.binding}other` })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const error = results.find(r => r.status === 'rejected').reason;
  assert.equal(error.code, 'RATE_LIMITED'); assert(error.retryAfter >= 1 && error.retryAfter <= 60);
  assert.equal(mailbox.size, 1);
});

test('hourly email limit survives browser/IP changes and cooldown expiry', async () => {
  const { service } = emailFixture(); const email = address();
  for (let i = 0; i < 5; i++) {
    await service.issue(email, emailFixture().browser);
    // Expire only the short cooldown windows; hourly windows remain live.
    await pool.query("UPDATE sixtysix.auth_rate_limits SET expires_at=now()-interval '1 second' WHERE expires_at<now()+interval '61 seconds'");
  }
  await rejected(service.issue(email, emailFixture().browser), 'RATE_LIMITED');
});

test('browser and IP send caps hold across different email addresses', async () => {
  const { service, browser, mailbox } = emailFixture();
  for (let i = 0; i < 10; i++) await service.issue(address(), browser);
  await rejected(service.issue(address(), browser), 'RATE_LIMITED');
  assert.equal(mailbox.size, 10);
  const next = emailFixture();
  for (let i = 0; i < 30; i++) await next.service.issue(address(), { ...next.browser, binding: randomBytes(32).toString('base64url') });
  await rejected(next.service.issue(address(), { ...next.browser, binding: randomBytes(32).toString('base64url') }), 'RATE_LIMITED');
});

test('unknown challenges still count toward verification rate limits', async () => {
  const { service, browser } = emailFixture();
  for (let i = 0; i < 30; i++) await rejected(service.verify(randomUUID(), '000000', browser), 'INVALID_CHALLENGE');
  await rejected(service.verify(randomUUID(), '000000', browser), 'RATE_LIMITED');
});

test('verification IP limit survives browser rotation', async () => {
  const { service, browser } = emailFixture();
  for (let i = 0; i < 120; i++) await rejected(service.verify(randomUUID(), '000000', { ...browser, binding: randomBytes(32).toString('base64url') }), 'INVALID_CHALLENGE');
  await rejected(service.verify(randomUUID(), '000000', { ...browser, binding: randomBytes(32).toString('base64url') }), 'RATE_LIMITED');
});

test('simultaneous wrong guesses cannot exceed or bypass the three-attempt cap', async () => {
  const { service, mailbox, browser } = emailFixture();
  const challenge = await service.issue(address(), browser);
  const code = mailbox.get(challenge.challengeId).code;
  const wrong = code === '000000' ? '111111' : '000000';
  await Promise.all(Array.from({ length: 6 }, () => rejected(service.verify(challenge.challengeId, wrong, browser), 'INVALID_CHALLENGE')));
  assert.equal((await pool.query('SELECT attempts FROM sixtysix.email_challenges WHERE id=$1', [challenge.challengeId])).rows[0].attempts, 3);
  await rejected(service.verify(challenge.challengeId, code, browser), 'INVALID_CHALLENGE');
});

test('HTTP email login enforces CSRF, closed input, cookies, retry headers and logout', async () => {
  const saved = { APP_ORIGIN: process.env.APP_ORIGIN, AUTH_CONTEXT_SECRET: process.env.AUTH_CONTEXT_SECRET, VERCEL: process.env.VERCEL };
  process.env.APP_ORIGIN = 'https://app.example.test';
  process.env.AUTH_CONTEXT_SECRET = 'test-only-browser-secret-0123456789abcdef0123456789abcdef';
  delete process.env.VERCEL;
  const { service, mailbox } = emailFixture();
  const app = createApp({ ready: async () => {}, habits: async () => [] }, { email: () => service, core: () => core });
  try {
    const context = await app.inject('/v1/auth/context');
    const cookie = context.headers['set-cookie'].split(';')[0];
    const headers = { cookie, origin: process.env.APP_ORIGIN, 'x-csrf-token': context.json().csrfToken };
    const email = address();
    const request = payload => app.inject({ method: 'POST', url: '/v1/auth/code', headers, payload });
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/code', payload: { email } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/code', headers: { ...headers, origin: 'https://other.test' }, payload: { email } })).statusCode, 403);
    assert.equal((await request({ email, purpose: 'link' })).statusCode, 400);
    assert.equal(mailbox.size, 0);
    const issued = await request({ email }); assert.equal(issued.statusCode, 202);
    assert.equal(issued.headers['cache-control'], 'no-store');
    const limited = await request({ email }); assert.equal(limited.statusCode, 429); assert(Number(limited.headers['retry-after']) > 0);
    const challengeId = issued.json().challengeId;
    const verified = await app.inject({ method: 'POST', url: '/v1/auth/verify', headers, payload: { challengeId, code: mailbox.get(challengeId).code } });
    assert.equal(verified.statusCode, 200);
    assert.deepEqual(verified.json(), { purpose: 'login', nextAction: 'SIGNED_IN', intentId: null });
    const sessionHeader = verified.headers['set-cookie'];
    assert.match(sessionHeader, /^__Host-sixtysix\.session=/); assert.match(sessionHeader, /HttpOnly/); assert.match(sessionHeader, /Secure/);
    const sessionCookieValue = sessionHeader.split(';')[0];
    const token = readSessionCookie({ origin: process.env.APP_ORIGIN, secret: process.env.AUTH_CONTEXT_SECRET }, sessionCookieValue);
    assert((await core.session(token)).userId);
    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { ...headers, cookie: `${cookie}; ${sessionCookieValue}` } });
    assert.equal(logout.statusCode, 204); assert.match(logout.headers['set-cookie'], /Max-Age=0/);
    await rejected(core.session(token), 'UNAUTHENTICATED');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/auth/logout', headers })).statusCode, 204);
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

function kakaoFixture(subject = kakao()) {
  let exchanges = 0;
  const provider = {
    authorize: (state, fresh) => `https://kauth.kakao.com/oauth/authorize?state=${state}&prompt=${fresh ? 'login' : ''}`,
    exchange: async () => { exchanges++; return subject; },
  };
  const service = new KakaoLogin(runtimePool, otpSecret, provider);
  return { service, provider, browser: emailFixture().browser, count: () => exchanges };
}
const stateFrom = url => new URL(url).searchParams.get('state');
test('Kakao login stores only a hashed state and supports an email-less subject', async () => {
  const { service, browser, count } = kakaoFixture();
  const state = stateFrom(await service.start(browser, '/onboarding'));
  const row = (await pool.query('SELECT state_hash FROM sixtysix.oauth_states WHERE state_hash=$1', [digest(state)])).rows[0];
  assert.equal(row.state_hash, digest(state)); assert.notEqual(row.state_hash, state);
  const result = await service.callback({ state, code:'code' }, browser.binding);
  assert.equal(result.returnTo, '/onboarding'); assert((await core.session(result.session.token)).userId);
  assert.equal(count(), 1);
  await rejected(service.callback({ state, code:'code' }, browser.binding), 'INVALID_OAUTH_STATE');
  assert.equal(count(), 1);
});

test('OAuth wrong browser, expired state and arbitrary return URL are rejected', async () => {
  const { service, browser, count } = kakaoFixture();
  await rejected(service.start(browser, 'https://attacker.test'), 'FORBIDDEN');
  const state = stateFrom(await service.start(browser));
  await rejected(service.callback({ state, code:'code' }, `${browser.binding}other`), 'INVALID_OAUTH_STATE');
  assert.equal(count(), 0);
  await pool.query("UPDATE sixtysix.oauth_states SET created_at=now()-interval '10 minutes',expires_at=now()-interval '6 minutes' WHERE state_hash=$1", [digest(state)]);
  await rejected(service.callback({ state, code:'code' }, browser.binding), 'INVALID_OAUTH_STATE');
  assert.equal(count(), 0);
});

test('OAuth cancellation and concurrent callbacks consume state only once', async () => {
  const { service, browser, count } = kakaoFixture();
  const cancelled = stateFrom(await service.start(browser));
  await rejected(service.callback({state:cancelled,error:'access_denied'},browser.binding),'FORBIDDEN');
  await rejected(service.callback({state:cancelled,code:'code'},browser.binding),'INVALID_OAUTH_STATE');
  assert.equal(count(),0);
  const state = stateFrom(await service.start(browser));
  const results = await Promise.allSettled([service.callback({state,code:'code'},browser.binding),service.callback({state,code:'code'},browser.binding)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(count(),1);
});

test('failed token exchange cannot be retried with the same state', async () => {
  const { service, provider, browser } = kakaoFixture();
  let calls = 0;
  provider.exchange = async () => { calls++; throw new Error('simulated-provider-failure'); };
  const state = stateFrom(await service.start(browser));
  await assert.rejects(service.callback({state,code:'code'},browser.binding));
  await rejected(service.callback({state,code:'code'},browser.binding),'INVALID_OAUTH_STATE');
  assert.equal(calls,1);
});

test('Kakao link verifies then requires a separate complete operation with the same session', async () => {
  const account = await login(); const subject = kakao();
  const {service,browser} = kakaoFixture(subject); const intents = new AuthIntents(runtimePool);
  const intent = await intents.beginLink(account.token,'kakao',browser.binding);
  const state = stateFrom(await service.start(browser,'/home',intent.id,account.token));
  const result = await service.callback({state,code:'code'},browser.binding,account.token);
  assert.equal(result.session,undefined); assert.match(result.returnTo,/COMPLETE_LINK/);
  assert.equal((await core.identities(account.token)).length,1);
  const other = await login('email',account.subject);
  await rejected(intents.complete(other.token,intent.id,browser.binding),'INVALID_CHALLENGE');
  const identities = await intents.complete(account.token,intent.id,browser.binding);
  assert.equal(identities.length,2); assert(identities.every(row=>!('subject' in row)));
  assert.equal((await login('kakao',subject)).userId,account.userId);
  await rejected(intents.complete(account.token,intent.id,browser.binding),'INVALID_CHALLENGE');
});

test('Kakao reauth prompts for login, refuses another subject and never switches account', async () => {
  const account = await login('kakao',kakao()); const intents = new AuthIntents(runtimePool);
  const identity = (await core.identities(account.token))[0];
  const {service,browser} = kakaoFixture(kakao());
  const intent = await intents.beginReauth(account.token,identity.id,browser.binding);
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=now()-interval '6 minutes' WHERE token_hash=$1",[digest(account.token)]);
  await rejected(service.start(browser,'/my',intent.id,account.token,'KAKAOTALK'),'FORBIDDEN');
  const url = await service.start(browser,'/my',intent.id,account.token); assert.equal(new URL(url).searchParams.get('prompt'),'login');
  await rejected(service.callback({state:stateFrom(url),code:'code'},browser.binding,account.token),'FORBIDDEN');
  assert.equal((await core.session(account.token)).recentlyAuthenticated,false);
});

test('Kakao reauth accepts the original identity and preserves the session token', async () => {
  const account = await login('kakao',kakao()); const intents = new AuthIntents(runtimePool);
  const {service,browser} = kakaoFixture(account.subject);
  const intent = await intents.beginReauth(account.token,(await core.identities(account.token))[0].id,browser.binding);
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=now()-interval '6 minutes' WHERE token_hash=$1",[digest(account.token)]);
  const state = stateFrom(await service.start(browser,'/my',intent.id,account.token));
  const result = await service.callback({state,code:'code'},browser.binding,account.token);
  assert.equal(result.session,undefined); assert.match(result.returnTo,/REAUTHENTICATED/);
  assert.equal((await core.session(account.token)).recentlyAuthenticated,true);
});

test('session revoked during provider exchange cannot complete reauth', async () => {
  const account = await login('kakao',kakao()); const intents = new AuthIntents(runtimePool);
  const {service,provider,browser} = kakaoFixture(account.subject);
  const intent = await intents.beginReauth(account.token,(await core.identities(account.token))[0].id,browser.binding);
  const state = stateFrom(await service.start(browser,'/my',intent.id,account.token));
  provider.exchange = async () => { await core.logout(account.token); return account.subject; };
  await rejected(service.callback({state,code:'code'},browser.binding,account.token),'UNAUTHENTICATED');
});

test('email intent reauth requires the original session and does not issue another login', async () => {
  const account = await login(); const other = await login('email',account.subject);
  const {service,browser,mailbox} = emailFixture(); const intents = new AuthIntents(runtimePool);
  const intent = await intents.beginReauth(account.token,(await core.identities(account.token))[0].id,browser.binding);
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=now()-interval '6 minutes' WHERE token_hash=$1",[digest(account.token)]);
  const challenge = await service.issueIntent(intent.id,account.token,browser); const code = mailbox.get(challenge.challengeId).code;
  await rejected(service.verify(challenge.challengeId,code,browser,other.token),'INVALID_CHALLENGE');
  const result = await service.verify(challenge.challengeId,code,browser,account.token);
  assert.equal(result.nextAction,'REAUTHENTICATED'); assert.equal(result.token,undefined);
  assert.equal((await core.session(account.token)).recentlyAuthenticated,true);
});

test('email intent link adds a new address only after verified complete', async () => {
  const account = await login('kakao',kakao()); const {service,browser,mailbox} = emailFixture(); const intents = new AuthIntents(runtimePool);
  const email = address(); const intent = await intents.beginLink(account.token,'email',browser.binding,email);
  await rejected(intents.complete(account.token,intent.id,browser.binding),'INVALID_CHALLENGE');
  const challenge = await service.issueIntent(intent.id,account.token,browser);
  const result = await service.verify(challenge.challengeId,mailbox.get(challenge.challengeId).code,browser,account.token);
  assert.equal(result.nextAction,'COMPLETE_LINK'); assert.equal(result.token,undefined);
  assert.equal((await core.identities(account.token)).length,1);
  assert.equal((await intents.complete(account.token,intent.id,browser.binding)).length,2);
  assert.equal((await login('email',email)).userId,account.userId);
});

test('verified provider belonging to someone else cannot be linked', async () => {
  const owner = await login('kakao',kakao()); const account = await login();
  const {service,browser} = kakaoFixture(owner.subject); const intents = new AuthIntents(runtimePool);
  const intent = await intents.beginLink(account.token,'kakao',browser.binding);
  const state = stateFrom(await service.start(browser,'/my',intent.id,account.token));
  await service.callback({state,code:'code'},browser.binding,account.token);
  await rejected(intents.complete(account.token,intent.id,browser.binding),'IDENTITY_ALREADY_LINKED');
});

test('OAuth start rate limit is shared across service instances', async () => {
  const {service,browser,provider} = kakaoFixture();
  for(let i=0;i<20;i++) await service.start(browser);
  const another = new KakaoLogin(runtimePool,otpSecret,provider);
  await rejected(another.start(browser),'RATE_LIMITED');
});

test('intent rate limit rejects before creating orphan link rows', async () => {
  const account = await login(); const intents = new AuthIntents(runtimePool);
  for(let i=0;i<20;i++) await intents.beginLink(account.token,'kakao',binding);
  await rejected(intents.beginLink(account.token,'kakao',binding),'RATE_LIMITED');
  const result = await pool.query('SELECT count(*)::int AS count FROM sixtysix.link_intents WHERE user_id=$1',[account.userId]);
  assert.equal(result.rows[0].count,20);
});

test('HTTP Kakao navigation, callback cookie, link completion and unlink enforce the contract', async () => {
  const saved = { APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET,VERCEL:process.env.VERCEL };
  process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-browser-secret-012345678901234567890123456789';delete process.env.VERCEL;
  const {service:kakaoService}=kakaoFixture(); const email=emailFixture(); const intents=new AuthIntents(runtimePool);
  const app=createApp({ready:async()=>{},habits:async()=>[]},{email:()=>email.service,core:()=>core},
    {intents:()=>intents,kakao:()=>kakaoService,email:()=>email.service,core:()=>core});
  try {
    const start=await app.inject('/v1/auth/kakao/start?returnTo=/home');assert.equal(start.statusCode,302);
    const cookie=start.headers['set-cookie'].split(';')[0];const state=stateFrom(start.headers.location);
    const wrong=await app.inject(`/v1/auth/kakao/callback?state=${state}&code=code`);
    assert.equal(wrong.statusCode,302);assert.match(wrong.headers.location,/INVALID_OAUTH_STATE/);assert.equal(wrong.headers['set-cookie'],undefined);
    const callback=await app.inject({url:`/v1/auth/kakao/callback?state=${state}&code=code`,headers:{cookie}});
    assert.equal(callback.headers.location,'/home');
    const sessionCookieValue=callback.headers['set-cookie'].split(';')[0];
    const context=await app.inject({url:'/v1/auth/context',headers:{cookie}});
    const headers={cookie:`${cookie}; ${sessionCookieValue}`,origin:process.env.APP_ORIGIN,'x-csrf-token':context.json().csrfToken};
    const request=(url,payload,method='POST')=>app.inject({url,method,headers,payload});
    const initiated=await request('/v1/me/identities/link-intents',{provider:'email',email:address()});
    assert.equal(initiated.statusCode,201);const intent=initiated.json();assert.equal(intent.nextAction,'ENTER_CODE');
    assert.equal((await request(`/v1/me/identities/link-intents/${intent.id}/complete`,{})).statusCode,400);
    const verification=await request('/v1/auth/verify',{challengeId:intent.challengeId,code:email.mailbox.get(intent.challengeId).code});
    assert.equal(verification.json().nextAction,'COMPLETE_LINK');assert.equal(verification.headers['set-cookie'],undefined);
    const linked=await request(`/v1/me/identities/link-intents/${intent.id}/complete`,{});assert.equal(linked.statusCode,200);assert.equal(linked.json().length,2);
    assert(linked.json().every(row=>Object.keys(row).sort().join(',')==='id,label,provider,usable'));
    const social=linked.json().find(row=>row.provider==='kakao');
    const reauth=await request('/v1/me/reauth-intents',{identityId:social.id});assert.equal(reauth.statusCode,201);assert.equal(reauth.json().nextAction,'REDIRECT');
    assert.equal((await request(`/v1/me/identities/${social.id}`,undefined,'DELETE')).statusCode,204);
    const emailId=linked.json().find(row=>row.provider==='email').id;
    assert.equal((await request(`/v1/me/identities/${emailId}`,undefined,'DELETE')).json().error.code,'LAST_IDENTITY');
    const replay=await app.inject({url:`/v1/auth/kakao/callback?state=${state}&code=code`,headers:{cookie}});assert.match(replay.headers.location,/INVALID_OAUTH_STATE/);
  } finally {
    await app.close();for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('current user returns only the session owner profile, masked identities and memberships',async()=>{
  const a=await login();const b=await login();
  const habit=(await pool.query(`INSERT INTO sixtysix.habits(slug,name,short_name,goal,image_ref,time_of_day)
    VALUES ($1,'검수 독서','독서','15분','sample','morning') RETURNING id`,[randomUUID()])).rows[0].id;
  const cohort=(await pool.query(`INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
    VALUES ($1,1,'test','2026-10-06T19:00:00Z','2026-10-01T00:00:00Z',30,10) RETURNING id`,[habit])).rows[0].id;
  const membership=(await pool.query('INSERT INTO sixtysix.memberships(user_id,cohort_id) VALUES ($1,$2) RETURNING id',[a.userId,cohort])).rows[0].id;
  const foreign=(await pool.query('INSERT INTO sixtysix.memberships(user_id,cohort_id) VALUES ($1,$2) RETURNING id',[b.userId,cohort])).rows[0].id;
  await pool.query('INSERT INTO sixtysix.user_cohort_slots(user_id,membership_id) VALUES ($1,$2)',[a.userId,membership]);
  const result=await core.me(a.token);
  assert.equal(result.profile.id,a.userId);assert.equal(result.currentMembershipId,membership);
  assert.equal(result.memberships.length,1);assert.equal(result.memberships[0].id,membership);
  assert(!JSON.stringify(result).includes(foreign));assert(!JSON.stringify(result).includes(a.subject));
  assert.deepEqual(Object.keys(result).sort(),['currentMembershipId','identities','memberships','preferences','profile']);
  assert.equal(result.identities[0].label,`${a.subject[0]}***@example.test`);
  const empty=await core.me((await login()).token);assert.equal(empty.currentMembershipId,null);assert.deepEqual(empty.memberships,[]);
});

test('GET /me uses only the HttpOnly session and rejects missing, forged, suspended and revoked sessions',async()=>{
  const saved={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};
  process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-browser-secret-012345678901234567890123456789';
  const app=createApp({ready:async()=>{},habits:async()=>[]},undefined,
    {core:()=>core,intents:()=>new AuthIntents(runtimePool),email:()=>emailFixture().service,kakao:()=>kakaoFixture().service});
  try{
    assert.equal((await app.inject('/v1/me')).statusCode,401);
    const account=await login();const headers={cookie:`__Host-sixtysix.session=${account.token}`};
    const me=await app.inject({url:'/v1/me',headers});assert.equal(me.statusCode,200);assert.equal(me.json().profile.id,account.userId);
    assert.equal(me.headers['cache-control'],'no-store');assert(!me.body.includes(account.token));assert(!me.body.includes('token_hash'));
    assert.equal((await app.inject({url:`/v1/me?userId=${randomUUID()}`,headers})).statusCode,400);
    assert.equal((await app.inject({url:'/v1/me',headers:{cookie:`__Host-sixtysix.session=${'a'.repeat(43)}`}})).statusCode,401);
    await pool.query('UPDATE sixtysix.app_users SET suspended_at=now() WHERE id=$1',[account.userId]);
    assert.equal((await app.inject({url:'/v1/me',headers})).statusCode,401);
    const another=await login();await core.logout(another.token);
    assert.equal((await app.inject({url:'/v1/me',headers:{cookie:`__Host-sixtysix.session=${another.token}`}})).statusCode,401);
  }finally{await app.close();for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

// Public recruitment and membership commands share the real auth/database fixture.
const { CohortService } = await import('../../sixtysix-v2/server/cohorts/service.ts');
async function recruitment(options={}) {
  const habit=(await pool.query(`INSERT INTO sixtysix.habits(slug,name,short_name,goal,image_ref,time_of_day)
    VALUES ($1,'테스트 걷기','걷기','15분','/test.webp','morning') RETURNING id`,[randomUUID()])).rows[0].id;
  const start=new Date();start.setUTCHours(19,0,0,0);start.setUTCDate(start.getUTCDate()+3);
  const row=(await pool.query(`INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
    VALUES ($1,1,$2,$3,clock_timestamp()-interval '1 day',$4,$5) RETURNING id`,[habit,randomUUID(),start,options.capacity??30,options.min??1])).rows[0];
  return {id:row.id,habit};
}
const join=(svc,session,id,key=randomUUID())=>svc.command(session.token,key,{kind:'join',cohortId:id});
const cancel=(svc,session,id,key=randomUUID())=>svc.command(session.token,key,{kind:'cancel',membershipId:id});
async function pastStart(id,days=1){
  await pool.query(`UPDATE sixtysix.cohorts SET recruitment_opens_at=date_trunc('day',clock_timestamp())-interval '100 days',
    starts_at=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC')-($2*interval '1 day')+interval '19 hours') AT TIME ZONE 'UTC' WHERE id=$1`,[id,days+1]);
}
test('recruitment lists public fields, pagination and personal slot eligibility',async()=>{
  const svc=new CohortService(runtimePool);const a=await recruitment();const b=(await pool.query(`INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
    SELECT habit_id,1,$2,starts_at+interval '1 day',recruitment_opens_at,30,1 FROM sixtysix.cohorts WHERE id=$1 RETURNING id`,[a.id,randomUUID()])).rows[0];
  const first=await svc.list({habitId:a.habit,limit:1});assert.equal(first.items.length,1);assert(first.nextCursor);assert.equal(first.items[0].canJoin,true);
  const second=await svc.list({habitId:a.habit,limit:1,cursor:first.nextCursor});assert.equal(second.items[0].id,b.id);assert.equal(second.nextCursor,null);
  await rejected(svc.list({cursor:'broken'}),'INVALID_REQUEST');
  const user=await login();await join(svc,user,a.id);
  const mine=await svc.list({habitId:a.habit},user.token);assert(mine.items.every(row=>!row.canJoin));
  assert.equal((await svc.detail(a.id)).participantCount,1);
  assert(!JSON.stringify(mine).includes(user.userId));assert(!JSON.stringify(mine).includes(user.subject));
});
test('last place race admits exactly one participant',async()=>{
  const svc=new CohortService(runtimePool);const c=await recruitment({capacity:1});const users=await Promise.all([login(),login(),login()]);
  const results=await Promise.allSettled(users.map(user=>join(svc,user,c.id)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='COHORT_FULL'));
  assert.equal((await svc.detail(c.id)).participantCount,1);
});
test('same user racing two cohorts acquires only one slot',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const cohorts=await Promise.all([recruitment(),recruitment()]);
  const results=await Promise.allSettled(cohorts.map(c=>join(svc,user,c.id)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ACTIVE_MEMBERSHIP_EXISTS');
});
test('same key race replays original success; changed body/path conflicts even after cancel',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const c=await recruitment();const other=await recruitment();const key=randomUUID();
  const [a,b]=await Promise.all([join(svc,user,c.id,key),join(svc,user,c.id,key)]);assert.deepEqual(a,b);
  assert.deepEqual(await join(svc,user,c.id.toUpperCase(),key),a);
  assert.equal((await svc.detail(c.id.toUpperCase())).id,c.id);
  await rejected(join(svc,user,other.id,key),'IDEMPOTENCY_CONFLICT');await rejected(cancel(svc,user,a.id,key),'IDEMPOTENCY_CONFLICT');
  await cancel(svc,user,a.id);assert.deepEqual(await join(svc,user,c.id,key),a);
  assert.equal((await core.me(user.token)).currentMembershipId,null);
  await rejected(join(svc,user,c.id),'JOIN_CLOSED');await join(svc,user,other.id);
});
test('cancel checks owner, explicit time boundary, frees place and replays after start',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const stranger=await login();const c=await recruitment({capacity:1});const m=await join(svc,user,c.id);
  await rejected(cancel(svc,stranger,m.id),'NOT_FOUND');const key=randomUUID();const cancelled=await cancel(svc,user,m.id,key);assert(cancelled.cancelledAt);
  const next=await join(svc,stranger,c.id);await pastStart(c.id);
  await rejected(cancel(svc,stranger,next.id),'JOIN_CLOSED');assert.deepEqual(await cancel(svc,user,m.id,key),cancelled);
  assert.equal((await svc.detail(c.id)).status,'active');
});
test('launch shortfall is persisted once with outbox even when command is rejected',async()=>{
  const svc=new CohortService(runtimePool);const c=await recruitment({min:2});const user=await login();await join(svc,user,c.id);await pastStart(c.id);
  await rejected(join(svc,await login(),c.id),'JOIN_CLOSED');
  const [a,b]=await Promise.all([svc.detail(c.id,user.token),svc.detail(c.id)]);assert.equal(a.status,'cancelled');assert.equal(b.cancellationReason,'MIN_PARTICIPANTS');
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${c.id}`])).rows[0].count,'1');
  assert.equal((await core.me(user.token)).currentMembershipId,null);await join(svc,user,(await recruitment()).id);
});
test('ended slot releases, not-yet-open and past-start cohorts reject joins',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const c=await recruitment();await join(svc,user,c.id);await pastStart(c.id,70);
  const next=await recruitment();await join(svc,user,next.id);assert.equal((await svc.detail(c.id)).status,'ended');
  const future=await recruitment();await pool.query("UPDATE sixtysix.cohorts SET recruitment_opens_at=starts_at-interval '1 hour' WHERE id=$1",[future.id]);
  const other=await login();await rejected(join(svc,other,future.id),'JOIN_CLOSED');assert.equal((await svc.detail(future.id)).status,'scheduled');
});
test('write receipt failure rolls back membership, slot and audit atomically',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const c=await recruitment();
  // A test-only audit constraint fails after the membership/slot/receipt writes.
  await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_reject_actor CHECK(actor_id<>'${user.userId}'::uuid OR action NOT LIKE 'membership.%')`);
  try { await assert.rejects(join(svc,user,c.id)); }
  finally { await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_reject_actor'); }
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.idempotency_records WHERE user_id=$1',[user.userId])).rows[0].count,'0');
  assert.equal((await svc.detail(c.id)).participantCount,0);assert.equal((await core.me(user.token)).currentMembershipId,null);
});
test('revoked and suspended users cannot join or replay a previous success',async()=>{
  const svc=new CohortService(runtimePool);const user=await login();const c=await recruitment();const key=randomUUID();await join(svc,user,c.id,key);
  await core.logout(user.token);await rejected(join(svc,user,c.id,key),'UNAUTHENTICATED');
  const suspended=await login();await pool.query('UPDATE sixtysix.app_users SET suspended_at=clock_timestamp() WHERE id=$1',[suspended.userId]);
  await rejected(join(svc,suspended,c.id),'UNAUTHENTICATED');
});
test('recruitment HTTP validates query, session, CSRF, ownership, confirm and idempotency headers',async()=>{
  const old={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';
  const svc=new CohortService(runtimePool);const app=createApp(undefined,undefined,undefined,()=>svc);
  try{
    const c=await recruitment();const user=await login();
    assert.equal((await app.inject(`/v1/cohorts?habitId=${c.habit}&limit=1`)).statusCode,200);
    for(const query of ['userId=forged','limit=0','limit=51','limit=1.5','cursor=broken'])assert.equal((await app.inject(`/v1/cohorts?${query}`)).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/memberships',payload:{cohortId:c.id}})).statusCode,401);
    const context=await app.inject('/v1/auth/context');const headers={cookie:`${context.headers['set-cookie'].split(';')[0]}; __Host-sixtysix.session=${user.token}`,origin:'https://app.example.test','x-csrf-token':context.json().csrfToken,'idempotency-key':randomUUID()};
    assert.equal((await app.inject({method:'POST',url:'/v1/memberships',headers:{...headers,origin:'https://evil.test'},payload:{cohortId:c.id}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/v1/memberships',headers:{...headers,'idempotency-key':'bad'},payload:{cohortId:c.id}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/v1/memberships',headers,payload:{cohortId:c.id,userId:user.userId}})).statusCode,400);
    const joined=await app.inject({method:'POST',url:'/v1/memberships',headers,payload:{cohortId:c.id}});assert.equal(joined.statusCode,201,joined.body);assert.equal(joined.headers['cache-control'],'no-store');
    const cancelled=await app.inject({method:'POST',url:`/v1/memberships/${joined.json().id}/cancel`,headers:{...headers,'idempotency-key':randomUUID()},payload:{confirm:false}});assert.equal(cancelled.statusCode,400);
    const valid=await app.inject({method:'POST',url:`/v1/memberships/${joined.json().id}/cancel`,headers:{...headers,'idempotency-key':randomUUID()},payload:{confirm:true}});assert.equal(valid.statusCode,200);assert(valid.json().cancelledAt);
  }finally{await app.close();for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('locked DB clock enforces start and final-submission millisecond boundaries',async()=>{
  const c=await recruitment();const start=(await pool.query('SELECT starts_at FROM sixtysix.cohorts WHERE id=$1',[c.id])).rows[0].starts_at;
  let clock=new Date(start.getTime()-1);
  // Only the transaction's locked decision clock is controlled; SQL, locks,
  // constraints, session validation and mutations still use real PostgreSQL.
  const timed={async connect(){const client=await runtimePool.connect();return {query:(sql,values)=>sql==='SELECT clock_timestamp() AS now'?Promise.resolve({rows:[{now:clock}]}):client.query(sql,values),release:discard=>client.release(discard)};}};
  const svc=new CohortService(timed);const user=await login();const m=await join(svc,user,c.id);
  clock=start;await rejected(cancel(svc,user,m.id),'JOIN_CLOSED');await rejected(join(svc,await login(),c.id),'JOIN_CLOSED');
  const next=await recruitment();clock=new Date(start.getTime()+(66*24+12)*3600000);
  assert.equal((await svc.detail(c.id,user.token)).status,'active');assert.equal((await core.me(user.token)).currentMembershipId,m.id);
  clock=new Date(clock.getTime()+1);assert.equal((await svc.detail(c.id,user.token)).status,'ended');assert.equal((await core.me(user.token)).currentMembershipId,null);
  assert(next.id);
});

const { EntryService }=await import('../../sixtysix-v2/server/entries/service.ts');
async function activityFixture(options={}){
  const c=await recruitment(options);const user=await login();const membership=await join(new CohortService(runtimePool),user,c.id);
  const start=(await pool.query('SELECT starts_at FROM sixtysix.cohorts WHERE id=$1',[c.id])).rows[0].starts_at;
  let clock=new Date(start);
  const timed={async connect(){const client=await runtimePool.connect();return {query:(sql,values)=>sql==='SELECT clock_timestamp() AS now'?Promise.resolve({rows:[{now:clock}]}):client.query(sql,values),release:discard=>client.release(discard)};}};
  return {c,user,membership,start,svc:new EntryService(timed),setClock:ms=>{clock=new Date(ms);}};
}
const entryInput=(day=1,late=false)=>({text:'오늘도 15분 걸었어요',samplePhotoRef:null,visibility:'cohort',expectedTargetDay:day,expectedLate:late});
const save=(f,kind='checkin',body=entryInput(),key=randomUUID())=>f.svc.write(f.user.token,f.membership.id,key,kind,body);
const home=f=>f.svc.read(f.user.token,f.membership.id,'home');
const record=f=>f.svc.read(f.user.token,f.membership.id,'record');
const DAY_MS=86400000;
test('real home/write/66-day record agree with the OpenAPI response schemas',async()=>{
  const f=await activityFixture();const before=await home(f);assert.equal(before.availability.targetDay,1);assert.equal(before.progress.filled,0);
  const saved=await save(f);assert.equal(saved.home.todayStatus,'checkin');assert.equal(saved.home.progress.checkins,1);assert.equal(saved.home.participation.done,1);
  const history=await record(f);assert.equal(history.days.length,66);assert.equal(history.days[0].status,'done');assert.equal(history.entries[0].id,saved.entry.id);assert.deepEqual(history.progress,saved.home.progress);
  const req=createRequire(new URL('../package.json',import.meta.url));const parser=req('@apidevtools/swagger-parser');const Ajv=req('ajv');const addFormats=req('ajv-formats');
  const api=await parser.validate(new URL('../openapi.json',import.meta.url).pathname);const ajv=new Ajv({strict:false});addFormats(ajv);
  for(const [schema,value]of [['Home',before],['WriteResult',saved],['Record',history]]){const validate=ajv.compile(api.components.schemas[schema]);assert(validate(value),JSON.stringify(validate.errors));}
});
test('checkin/pass same-day race creates one fact; duplicate success replays original body',async()=>{
  const f=await activityFixture();const key=randomUUID();const request=entryInput();
  const [a,b]=await Promise.all([save(f,'checkin',request,key),save(f,'checkin',request,key)]);assert.deepEqual(a,b);
  await rejected(save(f,'checkin',{...request,text:'다른 내용'},key),'IDEMPOTENCY_CONFLICT');
  await rejected(save(f,'pass',{expectedTargetDay:1,expectedLate:false}),'ALREADY_FILLED');
  const g=await activityFixture();const race=await Promise.allSettled([save(g),save(g,'pass',{expectedTargetDay:1,expectedLate:false})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal((await record(g)).entries.length,1);
});
test('04:00, 16:00 inclusive and target changes use the same boundary for writes and reads',async()=>{
  const f=await activityFixture();f.setClock(f.start.getTime()-1);await rejected(save(f),'BEFORE_START');
  f.setClock(f.start.getTime()+DAY_MS);const h=await home(f);assert.equal(h.cohortDay,2);assert.equal(h.availability.targetDay,1);assert.equal(h.availability.late,true);
  await rejected(save(f,'checkin',entryInput(1,false)),'TARGET_CHANGED');
  const late=await save(f,'checkin',entryInput(1,true));assert.equal(late.entry.late,true);assert.equal(late.home.todayStatus,'empty');assert.equal(late.home.availability.targetDay,2);assert.equal(late.home.participation.done,0);
  const g=await activityFixture();g.setClock(g.start.getTime()+DAY_MS+12*3600000);assert.equal((await home(g)).availability.targetDay,1);await save(g,'checkin',entryInput(1,true));
  const next=await activityFixture();next.setClock(next.start.getTime()+DAY_MS+12*3600000+1);const advanced=await home(next);assert.equal(advanced.availability.targetDay,2);assert.equal(advanced.availability.late,false);await rejected(save(next,'checkin',entryInput(1,true)),'TARGET_CHANGED');
});
test('last late window accepts day 66, never day 67; retry still succeeds after close',async()=>{
  const f=await activityFixture();f.setClock(f.start.getTime()+66*DAY_MS+12*3600000);const h=await home(f);assert.equal(h.state,'ended');assert.equal(h.action.type,'LATE_CHECKIN');assert.equal(h.availability.targetDay,66);
  const key=randomUUID(),body=entryInput(66,true);const saved=await save(f,'checkin',body,key);f.setClock(f.start.getTime()+66*DAY_MS+12*3600000+1);
  assert.equal((await home(f)).availability.reason,'ENDED');assert.deepEqual(await save(f,'checkin',body,key),saved);await rejected(save(f,'checkin',body),'ENDED');assert.equal((await record(f)).days.length,66);
});
test('last pass race cannot exceed three uses, pass leaves checkin count unchanged',async()=>{
  const f=await activityFixture();await save(f,'pass',{expectedTargetDay:1,expectedLate:false});f.setClock(f.start.getTime()+DAY_MS);await save(f,'pass',{expectedTargetDay:2,expectedLate:false});
  f.setClock(f.start.getTime()+2*DAY_MS);const results=await Promise.allSettled([save(f,'pass',{expectedTargetDay:3,expectedLate:false}),save(f,'pass',{expectedTargetDay:3,expectedLate:false})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  f.setClock(f.start.getTime()+3*DAY_MS);await rejected(save(f,'pass',{expectedTargetDay:4,expectedLate:false}),'PASS_EXHAUSTED');const h=await home(f);assert.equal(h.progress.passes,3);assert.equal(h.progress.checkins,0);assert.equal(h.progress.filled,3);assert.equal(h.progress.streak,3);
});
test('trim/UTF16 length and sample catalog are validated without writing a fact',async()=>{
  const f=await activityFixture();for(const text of ['   ','\0','😀'.repeat(21)])await rejected(save(f,'checkin',{...entryInput(),text}),'INVALID_TEXT');
  await rejected(save(f,'checkin',{...entryInput(),samplePhotoRef:'unknown'}),'INVALID_MEDIA');
  const ref=randomUUID();await pool.query("INSERT INTO sixtysix.sample_photos(ref,public_path) VALUES ($1,'/images/habit-reading.webp')",[ref]);
  const result=await save(f,'checkin',{...entryInput(),text:`  ${'😀'.repeat(20)}  `,samplePhotoRef:ref});assert.equal(result.entry.text.length,40);assert.equal(result.entry.simple,false);assert.equal((await record(f)).entries.length,1);
});
test('owner-only private records survive leaving, but writes and revoked-session replays are blocked',async()=>{
  const f=await activityFixture();const stranger=await login();const key=randomUUID(),body={...entryInput(),visibility:'private'};const saved=await save(f,'checkin',body,key);
  await rejected(f.svc.read(stranger.token,f.membership.id,'record'),'NOT_FOUND');await rejected(f.svc.write(stranger.token,f.membership.id,randomUUID(),'checkin',body),'NOT_FOUND');
  await pool.query('UPDATE sixtysix.memberships SET left_at=joined_at WHERE id=$1',[f.membership.id]);f.setClock(f.start.getTime()+DAY_MS);
  assert.equal((await record(f)).entries[0].text,body.text);await rejected(save(f,'checkin',entryInput(2)),'LEFT');
  await core.logout(f.user.token);await rejected(save(f,'checkin',body,key),'UNAUTHENTICATED');assert(saved.entry.id);
});
test('minimum shortfall and cancelled membership block records while keeping readable history',async()=>{
  const f=await activityFixture({min:2});await rejected(save(f),'CANCELLED');assert.equal((await home(f)).cohort.status,'cancelled');assert.equal((await record(f)).entries.length,0);
  const g=await activityFixture();await pool.query('UPDATE sixtysix.memberships SET cancelled_at=joined_at WHERE id=$1',[g.membership.id]);await rejected(save(g),'CANCELLED');
});
test('audit failure rolls back entry and receipt; successful key conflicts with recruitment command',async()=>{
  const f=await activityFixture();await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_entry_actor CHECK(actor_id<>'${f.user.userId}'::uuid OR action NOT LIKE 'entry.%')`);
  const key=randomUUID();try{await assert.rejects(save(f,'checkin',entryInput(),key));}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_entry_actor');}
  assert.equal((await record(f)).entries.length,0);const result=await save(f,'checkin',entryInput(),key);assert(result.entry.id);
  await rejected(join(new CohortService(runtimePool),f.user,f.c.id,key),'IDEMPOTENCY_CONFLICT');
});
test('entry HTTP rejects forged facts and unknown payloads, requires session/CSRF/key',async()=>{
  const f=await activityFixture();const savedEnv={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';
  const app=createApp(undefined,undefined,undefined,undefined,()=>f.svc);const path=`/v1/memberships/${f.membership.id}`;
  try{
    assert.equal((await app.inject(`${path}/home`)).statusCode,401);const context=await app.inject('/v1/auth/context');const headers={cookie:`${context.headers['set-cookie'].split(';')[0]}; __Host-sixtysix.session=${f.user.token}`,origin:'https://app.example.test','x-csrf-token':context.json().csrfToken,'idempotency-key':randomUUID()};
    for(const extra of [{userId:f.user.userId},{createdAt:new Date().toISOString()},{cohortDay:1}])assert.equal((await app.inject({method:'POST',url:`${path}/checkins`,headers,payload:{...entryInput(),...extra}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:`${path}/checkins`,headers:{...headers,origin:'https://evil.test'},payload:entryInput()})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:`${path}/passes`,headers,payload:{expectedTargetDay:67,expectedLate:false}})).statusCode,400);
    const good=await app.inject({method:'POST',url:`${path}/checkins`,headers,payload:entryInput()});assert.equal(good.statusCode,201,good.body);assert.equal(good.headers['cache-control'],'no-store');
    assert.equal((await app.inject({url:`${path}/record`,headers})).json().entries[0].id,good.json().entry.id);
  }finally{await app.close();for(const[k,v]of Object.entries(savedEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

// Authentication audit and bounded ephemera cleanup, under the runtime login.
test('account lifecycle audit contains fixed events and no provider/session secrets',async()=>{
  const account=await login();const linked=await link(account,'kakao',kakao());
  const proof=await core.recordVerifiedProof({purpose:'reauth',provider:'email',subject:account.subject,browserBinding:binding,sessionToken:account.token});
  await core.reauthenticate(account.token,proof,binding);await core.unlink(account.token,linked.id);
  await core.logout(account.token);await core.logout(account.token);
  const rows=(await pool.query('SELECT action,actor_id,target_id,request_id,reason_code FROM sixtysix.audit_events WHERE actor_id=$1 ORDER BY created_at,id',[account.userId])).rows;
  assert.deepEqual(rows.map(r=>r.action),['auth.login.email','auth.identity.link.kakao','auth.reauthenticate.email','auth.identity.unlink.kakao','auth.logout']);
  assert(rows.every(r=>/^[0-9a-f-]{36}$/.test(r.request_id)&&r.reason_code===null));
  const serialized=JSON.stringify(rows);for(const value of [account.subject,account.token,digest(account.token),binding,digest(binding)])assert(!serialized.includes(value));
});

test('audit rejection commits only a public code, without attributing guessed identity',async()=>{
  const account=await login();const identity=(await core.identities(account.token))[0];const requestId=randomUUID();
  await authAuditContext.run(requestId,()=>rejected(core.unlink(account.token,identity.id),'LAST_IDENTITY'));
  const row=(await pool.query('SELECT * FROM sixtysix.audit_events WHERE request_id=$1',[requestId])).rows[0];
  assert.equal(row.action,'auth.identity.unlink.rejected');assert.equal(row.reason_code,'LAST_IDENTITY');assert.equal(row.actor_id,null);assert.equal(row.target_id,null);
  assert.equal((await core.identities(account.token)).length,1);
});

test('unverified session cookies cannot create rejection audit rows',async()=>{
  const requestId=randomUUID();
  await authAuditContext.run(requestId,()=>rejected(core.unlink(randomBytes(32).toString('base64url'),randomUUID()),'UNAUTHENTICATED'));
  assert.equal((await pool.query('SELECT 1 FROM sixtysix.audit_events WHERE request_id=$1',[requestId])).rowCount,0);
});

test('audit insertion failure rolls back login and proof consumption',async()=>{
  const proof=await core.recordVerifiedProof({purpose:'login',provider:'email',subject:address(),browserBinding:binding});
  const before=(await pool.query('SELECT count(*) FROM sixtysix.auth_sessions')).rows[0].count;
  await pool.query("ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_auth_audit CHECK(action<>'auth.login.email') NOT VALID");
  try{await assert.rejects(core.login(proof,binding),{code:'23514'});}
  finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_auth_audit');}
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.auth_sessions')).rows[0].count,before);
  assert.equal((await pool.query('SELECT consumed_at FROM sixtysix.auth_proofs WHERE id=$1',[proof])).rows[0].consumed_at,null);
  assert((await core.login(proof,binding)).userId);
});

test('concurrent HTTP requests isolate server-generated audit IDs and ignore forged IDs',async()=>{
  const saved={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';
  const email=emailFixture();const app=createApp({ready:async()=>{},habits:async()=>[]},{email:()=>email.service,core:()=>core});const seen=new Map();
  app.addHook('preHandler',async request=>{if(request.body?.email)seen.set(request.body.email,request.id);});
  try{
    const contexts=await Promise.all([app.inject('/v1/auth/context'),app.inject('/v1/auth/context')]);const addresses=[address(),address()],forged=randomUUID();
    const responses=await Promise.all(contexts.map((context,i)=>app.inject({method:'POST',url:'/v1/auth/code',headers:{cookie:context.headers['set-cookie'].split(';')[0],origin:process.env.APP_ORIGIN,'x-csrf-token':context.json().csrfToken,'x-request-id':forged},payload:{email:addresses[i]}})));
    for(let i=0;i<responses.length;i++){assert.equal(responses[i].statusCode,202,responses[i].body);const event=(await pool.query("SELECT request_id FROM sixtysix.audit_events WHERE target_id=$1 AND action='auth.email.sent'",[responses[i].json().challengeId])).rows[0];assert.equal(event.request_id,seen.get(addresses[i]));assert.notEqual(event.request_id,forged);}
    assert.notEqual(seen.get(addresses[0]),seen.get(addresses[1]));
  }finally{await app.close();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('known OTP rejection and consumed OAuth cancellation leave sanitized audit facts',async()=>{
  const email=emailFixture();const challenge=await email.service.issue(address(),email.browser);const sent=email.mailbox.get(challenge.challengeId);const wrong=sent.code==='000000'?'000001':'000000';
  await rejected(email.service.verify(challenge.challengeId,wrong,email.browser),'INVALID_CHALLENGE');
  const event=(await pool.query("SELECT * FROM sixtysix.audit_events WHERE target_id=$1 AND action='auth.email.rejected'",[challenge.challengeId])).rows[0];
  assert.equal(event.reason_code,'INVALID_CHALLENGE');assert(!JSON.stringify(event).includes(sent.email));assert(!JSON.stringify(event).includes(sent.code));
  const oauth=kakaoFixture();const authorization=await oauth.service.start(oauth.browser);const requestId=randomUUID();
  await authAuditContext.run(requestId,()=>rejected(oauth.service.callback({state:new URL(authorization).searchParams.get('state'),error:'access_denied'},oauth.browser.binding),'FORBIDDEN'));
  assert.equal((await pool.query('SELECT action FROM sixtysix.audit_events WHERE request_id=$1',[requestId])).rows[0].action,'auth.kakao.rejected');
});

const cleanupAuth=async(batch=100,dryRun=true,client=runtimePool)=>(await client.query('SELECT sixtysix.cleanup_auth_ephemera($1,$2) AS value',[batch,dryRun])).rows[0].value;
const cleanedCount=result=>Object.values(result.counts).reduce((sum,n)=>sum+n,0);
async function clearExpiredFixtures(){for(let i=0;i<10;i++){const result=await cleanupAuth(500,false);if(!cleanedCount(result))return;}throw Error('unexpected fixture backlog');}
async function oldRate(offset='2 days'){
  const key=digest(randomUUID());await pool.query(`INSERT INTO sixtysix.auth_rate_limits(bucket_key,hits,expires_at) VALUES ($1,1,clock_timestamp()-$2::interval)`,[key,offset]);return key;
}
async function oldAuthGraph(){
  const account=await login(),session=digest(randomUUID()),link=randomUUID(),proof=randomUUID(),intent=randomUUID(),challenge=randomUUID(),state=digest(randomUUID());
  await pool.query("INSERT INTO sixtysix.auth_sessions(token_hash,user_id,created_at,expires_at) VALUES ($1,$2,now()-interval '3 days',now()-interval '2 days')",[session,account.userId]);
  await pool.query("INSERT INTO sixtysix.link_intents(id,user_id,session_binding_hash,provider,created_at,expires_at) VALUES ($1,$2,$3,'email',now()-interval '2 days 5 minutes',now()-interval '2 days')",[link,account.userId,session]);
  await pool.query("INSERT INTO sixtysix.auth_proofs(id,provider,subject,purpose,browser_binding_hash,session_binding_hash,link_intent_id,created_at,expires_at) VALUES ($1,'email',$2,'link',$3,$4,$5,now()-interval '2 days 5 minutes',now()-interval '2 days')",[proof,account.subject,digest(binding),session,link]);
  await pool.query("INSERT INTO sixtysix.auth_intents(id,purpose,provider,target_subject,browser_binding_hash,session_binding_hash,link_intent_id,proof_id,created_at,expires_at) VALUES ($1,'link','email',$2,$3,$4,$5,$6,now()-interval '2 days 5 minutes',now()-interval '2 days')",[intent,account.subject,digest(binding),session,link,proof]);
  await pool.query("INSERT INTO sixtysix.email_challenges(id,email,browser_binding_hash,code_hash,purpose,intent_id,created_at,expires_at) VALUES ($1,$2,$3,$4,'link',$5,now()-interval '2 days 5 minutes',now()-interval '2 days')",[challenge,account.subject,digest(binding),digest(randomUUID()),intent]);
  await pool.query("INSERT INTO sixtysix.oauth_states(state_hash,browser_binding_hash,intent_id,return_to,created_at,expires_at) VALUES ($1,$2,$3,'/my',now()-interval '2 days 5 minutes',now()-interval '2 days')",[state,digest(binding),intent]);
  const rate=await oldRate();return {account,session,link,proof,intent,challenge,state,rate};
}

test('cleanup dry-run preserves data; apply deletes children first and preserves users/audit',async()=>{
  await clearExpiredFixtures();const graph=await oldAuthGraph();const auditBefore=(await pool.query('SELECT count(*)::int AS n FROM sixtysix.audit_events')).rows[0].n;
  const dry=await cleanupAuth();assert.equal(dry.dryRun,true);assert.equal(dry.counts.oauth_states,1);assert.equal(dry.counts.auth_sessions,0); // referenced parents are not yet eligible
  assert.equal((await pool.query('SELECT 1 FROM sixtysix.email_challenges WHERE id=$1',[graph.challenge])).rowCount,1);
  const applied=await cleanupAuth(100,false);assert.equal(cleanedCount(applied),7);assert.equal(applied.counts.auth_sessions,1);
  assert.equal((await core.session(graph.account.token)).userId,graph.account.userId);assert.equal((await core.identities(graph.account.token)).length,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM sixtysix.audit_events')).rows[0].n,auditBefore+1);
  assert.equal(cleanedCount(await cleanupAuth(100,false)),0);
});

test('cleanup preserves live and recently expired rows on both sides of the grace window',async()=>{
  await clearExpiredFixtures();const old=await oldRate('24 hours 1 minute'),recent=await oldRate('23 hours 59 minutes'),live=await oldRate('-1 hour');
  const result=await cleanupAuth(100,false);assert.equal(result.counts.auth_rate_limits,1);
  assert.equal((await pool.query('SELECT bucket_key FROM sixtysix.auth_rate_limits WHERE bucket_key=ANY($1::text[])',[[old,recent,live]])).rowCount,2);
});

test('cleanup budget is shared across all tables and repeated batches drain the graph',async()=>{
  await clearExpiredFixtures();await oldAuthGraph();await oldAuthGraph();let removed=0;
  for(let i=0;i<8;i++){const result=await cleanupAuth(2,false);assert(cleanedCount(result)<=2);removed+=cleanedCount(result);}
  assert.equal(removed,14);
});

test('cleanup preserves an old parent still referenced by a live authentication flow',async()=>{
  await clearExpiredFixtures();const graph=await oldAuthGraph();
  await pool.query("UPDATE sixtysix.email_challenges SET created_at=now(),expires_at=now()+interval '5 minutes' WHERE id=$1",[graph.challenge]);
  const result=await cleanupAuth(100,false);assert.equal(result.counts.auth_intents,0);assert.equal(result.counts.auth_sessions,0);
  assert.equal((await pool.query('SELECT 1 FROM sixtysix.auth_proofs WHERE id=$1',[graph.proof])).rowCount,1);
});

test('cleanup skips row locks and returns busy when another cleanup holds the job lock',async()=>{
  await clearExpiredFixtures();const key=await oldRate();const holder=await pool.connect();
  try{
    await holder.query('BEGIN');await holder.query('SELECT bucket_key FROM sixtysix.auth_rate_limits WHERE bucket_key=$1 FOR UPDATE',[key]);
    assert.equal((await cleanupAuth(100,false)).counts.auth_rate_limits,0);
    await holder.query('SELECT pg_advisory_xact_lock(6666003)');assert.equal((await cleanupAuth()).status,'busy');
  }finally{await holder.query('ROLLBACK');holder.release();}
  assert.equal((await cleanupAuth(100,false)).counts.auth_rate_limits,1);
});

test('cleanup rollback restores deletions when its system audit cannot commit',async()=>{
  await clearExpiredFixtures();const key=await oldRate();
  await pool.query("ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_cleanup_audit CHECK(action<>'auth.cleanup') NOT VALID");
  try{await assert.rejects(cleanupAuth(100,false),{code:'23514'});}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_cleanup_audit');}
  assert.equal((await pool.query('SELECT 1 FROM sixtysix.auth_rate_limits WHERE bucket_key=$1',[key])).rowCount,1);
});

test('cleanup rejects unbounded inputs and runtime still cannot directly delete auth/audit',async()=>{
  for(const batch of [0,501,null])await assert.rejects(cleanupAuth(batch,false),{code:'22023'});
  await assert.rejects(cleanupAuth(100,null),{code:'22023'});
  for(const table of ['auth_sessions','auth_identities','email_challenges','audit_events'])await assert.rejects(runtimePool.query(`DELETE FROM sixtysix.${table}`),{code:'42501'});
  await verifyRuntime(runtimePool,runtimeRole);
});

// Business admission: real restricted connections and independent service instances.
const businessBucket=(user,scope)=>createHmac('sha256','sixtysix-business-v1').update(`rate:business.${scope}:${user}`).digest('hex');
async function businessHits(user,scope='command.minute'){
  return (await pool.query('SELECT hits FROM sixtysix.auth_rate_limits WHERE bucket_key=$1',[businessBucket(user,scope)])).rows[0]?.hits??0;
}
async function expireBusiness(user,scope){
  await pool.query("UPDATE sixtysix.auth_rate_limits SET expires_at=clock_timestamp()-interval '1 second' WHERE bucket_key=$1",[businessBucket(user,scope)]);
}
test('business concurrent rejected commands consume exactly twenty admissions across instances',async()=>{
  const user=await login();const missing=randomUUID();
  const results=await Promise.allSettled(Array.from({length:28},()=>join(new CohortService(runtimePool),user,missing)));
  assert.equal(results.filter(r=>r.reason?.code==='NOT_FOUND').length,20);
  assert.equal(results.filter(r=>r.reason?.code==='RATE_LIMITED').length,8);
  assert.equal(await businessHits(user.userId),20);assert.equal(await businessHits(user.userId,'command.hour'),20);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.idempotency_records WHERE user_id=$1',[user.userId])).rows[0].count,'0');
});
test('join cancel checkin and pass share quota across sessions but isolate other accounts',async()=>{
  const user=await login();const second=await login('email',user.subject);const missing=randomUUID();
  const cohorts=new CohortService(runtimePool),entries=new EntryService(runtimePool);
  for(let i=0;i<5;i++){
    await rejected(join(cohorts,user,missing),'NOT_FOUND');
    await rejected(cancel(cohorts,second,missing),'NOT_FOUND');
    await rejected(entries.write(user.token,missing,randomUUID(),'checkin',entryInput()),'NOT_FOUND');
    await rejected(entries.write(second.token,missing,randomUUID(),'pass',{expectedTargetDay:1,expectedLate:false}),'NOT_FOUND');
  }
  await rejected(join(cohorts,second,missing),'RATE_LIMITED');
  await rejected(join(cohorts,await login(),missing),'NOT_FOUND');
  assert.equal(await businessHits(user.userId),20);
});
test('successful receipt remains replayable at write quota, conflict consumes new-command quota',async()=>{
  const f=await activityFixture();const key=randomUUID(),body=entryInput();const saved=await save(f,'checkin',body,key);
  await rejected(save(f,'checkin',{...body,text:'changed'},key),'IDEMPOTENCY_CONFLICT');
  assert.equal(await businessHits(f.user.userId),3); // join, write, conflict
  for(let i=3;i<20;i++)await rejected(save(f),'ALREADY_FILLED');
  await rejected(save(f),'RATE_LIMITED');
  assert.deepEqual(await save(f,'checkin',body,key),saved);
  assert.equal(await businessHits(f.user.userId),20);assert.equal(await businessHits(f.user.userId,'replay.minute'),1);
  assert.equal((await record(f)).entries.length,1);
});
test('cached receipt floods are bounded and replay window resets without changing receipt',async()=>{
  const svc=new CohortService(runtimePool),user=await login(),c=await recruitment(),key=randomUUID();const saved=await join(svc,user,c.id,key);
  for(let i=0;i<60;i++)assert.deepEqual(await join(new CohortService(runtimePool),user,c.id,key),saved);
  await rejected(join(svc,user,c.id,key),'RATE_LIMITED');assert.equal(await businessHits(user.userId),1);
  await expireBusiness(user.userId,'replay.minute');assert.deepEqual(await join(svc,user,c.id,key),saved);
  assert.equal(await businessHits(user.userId,'replay.minute'),1);
});
test('hour quota persists across minute windows, blocked attempts do not extend expiry',async()=>{
  const svc=new CohortService(runtimePool),user=await login(),missing=randomUUID();
  for(let window=0;window<6;window++){
    if(window)await expireBusiness(user.userId,'command.minute');
    for(let i=0;i<20;i++)await rejected(join(svc,user,missing),'NOT_FOUND');
  }
  await expireBusiness(user.userId,'command.minute');
  const before=(await pool.query('SELECT expires_at FROM sixtysix.auth_rate_limits WHERE bucket_key=$1',[businessBucket(user.userId,'command.hour')])).rows[0].expires_at;
  await assert.rejects(join(svc,user,missing),e=>e.code==='RATE_LIMITED'&&e.retryAfter>60&&e.retryAfter<=3600);
  const after=(await pool.query('SELECT expires_at FROM sixtysix.auth_rate_limits WHERE bucket_key=$1',[businessBucket(user.userId,'command.hour')])).rows[0].expires_at;
  assert.deepEqual(after,before);assert.equal(await businessHits(user.userId,'command.hour'),120);
  await expireBusiness(user.userId,'command.hour');await rejected(join(svc,user,missing),'NOT_FOUND');
  assert.equal(await businessHits(user.userId),1);assert.equal(await businessHits(user.userId,'command.hour'),1);
});
test('unexpected write failure rolls back quota together with entry receipt and audit',async()=>{
  const f=await activityFixture();const initial=await businessHits(f.user.userId);
  await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_business_rollback CHECK(actor_id<>'${f.user.userId}'::uuid OR action NOT LIKE 'entry.%')`);
  try{await assert.rejects(save(f));}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_business_rollback');}
  assert.equal(await businessHits(f.user.userId),initial);assert.equal((await record(f)).entries.length,0);
  assert.equal((await pool.query("SELECT count(*) FROM sixtysix.idempotency_records WHERE user_id=$1 AND response_status=201",[f.user.userId])).rows[0].count,'1'); // only join
});
test('business HTTP returns bounded Retry-After on all four routes without mutations',async()=>{
  const f=await activityFixture(),svc=new CohortService(runtimePool);const old={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};
  process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';
  const app=createApp(undefined,undefined,undefined,()=>svc,()=>f.svc);
  try{
    for(let i=1;i<20;i++)await rejected(join(svc,f.user,randomUUID()),'NOT_FOUND');
    const context=await app.inject('/v1/auth/context');const headers={cookie:`${context.headers['set-cookie'].split(';')[0]}; __Host-sixtysix.session=${f.user.token}`,origin:'https://app.example.test','x-csrf-token':context.json().csrfToken};
    const path=`/v1/memberships/${f.membership.id}`;
    for(const[url,payload]of [['/v1/memberships',{cohortId:f.c.id}],[`${path}/cancel`,{confirm:true}],[`${path}/checkins`,entryInput()],[`${path}/passes`,{expectedTargetDay:1,expectedLate:false}]]){
      const result=await app.inject({method:'POST',url,headers:{...headers,'idempotency-key':randomUUID()},payload});
      assert.equal(result.statusCode,429,result.body);assert.equal(result.json().error.code,'RATE_LIMITED');
      assert(Number(result.headers['retry-after'])>=1&&Number(result.headers['retry-after'])<=60);assert.equal(result.headers['cache-control'],'no-store');
      assert(!result.body.includes(f.user.token));assert(!result.body.includes(f.user.userId));
    }
    assert.equal((await record(f)).entries.length,0);assert.equal((await home(f)).membership.cancelledAt,null);
    await core.logout(f.user.token);
    const unauth=await app.inject({method:'POST',url:`${path}/checkins`,headers:{...headers,'idempotency-key':randomUUID()},payload:entryInput()});
    assert.equal(unauth.statusCode,401);assert.equal(await businessHits(f.user.userId),20);
  }finally{await app.close();for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

// Outbox consumer tests never send mail or use remote services.
const { NotificationService }=await import('../../sixtysix-v2/server/notifications/service.ts');
async function emptyQueue(){await pool.query('DELETE FROM sixtysix.notifications');await pool.query('DELETE FROM sixtysix.outbox');}
async function launchEvent(cancelled=false){
  await emptyQueue();const svc=new CohortService(runtimePool),c=await recruitment({min:cancelled?3:1});
  const users=[await login(),await login()];const members=[];
  for(const user of users)members.push(await join(svc,user,c.id));
  const withdrawn=await login();const m=await join(svc,withdrawn,c.id);await cancel(svc,withdrawn,m.id);
  await pastStart(c.id);await svc.detail(c.id);
  const event=(await pool.query('SELECT * FROM sixtysix.outbox')).rows[0];
  return {c,users,members,withdrawn,event};
}
const claim=async(batch=20)=>(await workerPool.query('SELECT * FROM sixtysix.claim_outbox($1)',[batch])).rows;
const deliver=async(job)=>(await workerPool.query('SELECT sixtysix.deliver_outbox($1,$2) AS state',[job.id,job.lease_token])).rows[0].state;
const rejectJob=async(job,reason='RETRYABLE')=>(await workerPool.query('SELECT sixtysix.reject_outbox($1,$2,$3) AS state',[job.id,job.lease_token,reason])).rows[0].state;
async function expireLease(id){await pool.query("UPDATE sixtysix.outbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);}
async function availableNow(id){await pool.query("UPDATE sixtysix.outbox SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);}

test('worker and app have separate exact privileges; neither can edit inbox facts directly',async()=>{
  await verifyWorker(workerPool,workerRole);await verifyRuntime(runtimePool,runtimeRole);
  const owner=await pool.connect();try{await configureWorker(owner,workerRole,workerPassword);await configureRuntime(owner,runtimeRole,runtimePassword);}finally{owner.release();}
  await verifyWorker(workerPool,workerRole);await verifyRuntime(runtimePool,runtimeRole);
  for(const sql of ['SELECT * FROM sixtysix.auth_sessions','SELECT * FROM sixtysix.notifications','SELECT * FROM sixtysix.outbox','DELETE FROM sixtysix.outbox','CREATE TABLE public.worker_bad(id integer)','SELECT sixtysix.cleanup_auth_ephemera(1,true)'])
    await assert.rejects(workerPool.query(sql),{code:'42501'});
  for(const sql of ['SELECT sixtysix.outbox_status()','SELECT * FROM sixtysix.claim_outbox(1)',`SELECT sixtysix.deliver_outbox('${randomUUID()}','${randomUUID()}')`,`SELECT sixtysix.reject_outbox('${randomUUID()}','${randomUUID()}','RETRYABLE')`,'DELETE FROM sixtysix.notifications',"UPDATE sixtysix.notifications SET event_type='cohort.started'"])
    await assert.rejects(runtimePool.query(sql),{code:'42501'});
});
for(const cancelled of [false,true])test(`outbox ${cancelled?'cancellation':'start'} stores one inbox notification per eligible member atomically`,async()=>{
  const f=await launchEvent(cancelled);const before=await runOutbox(workerPool,{batch:20,apply:false});assert.equal(before.status.ready,1);
  assert.equal((await pool.query('SELECT attempts FROM sixtysix.outbox WHERE id=$1',[f.event.id])).rows[0].attempts,0);
  const result=await runOutbox(workerPool,{batch:20,apply:true});assert.equal(result.counts.delivered,1);assert.equal(result.status.delivered,1);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'2');
  const reader=new NotificationService(runtimePool);
  for(const user of f.users){const list=await reader.list(user.token);assert.equal(list.items.length,1);assert.equal(list.items[0].type,cancelled?'cohort.cancelled':'cohort.started');assert(!('user_id'in list.items[0]));}
  assert.equal((await reader.list(f.withdrawn.token)).items.length,0);
  assert.equal((await runOutbox(workerPool,{batch:20,apply:true})).counts.delivered,0);
});
test('parallel claims are disjoint and skip a row another worker locks',async()=>{
  await emptyQueue();await pool.query("INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload) SELECT 'unknown',gen_random_uuid()::text,'{}'::jsonb FROM generate_series(1,12)");
  const held=await pool.connect();try{
    await held.query('BEGIN');const id=(await held.query('SELECT id FROM sixtysix.outbox ORDER BY available_at,id LIMIT 1 FOR UPDATE')).rows[0].id;
    const batches=await Promise.all([claim(4),claim(4),claim(4)]);const jobs=batches.flat();assert.equal(jobs.length,11);assert.equal(new Set(jobs.map(j=>j.id)).size,11);assert(!jobs.some(j=>j.id===id));
  }finally{await held.query('ROLLBACK');held.release();}
  assert.equal((await claim()).length,1);
  for(const batch of [0,101,null])await assert.rejects(claim(batch),{code:'22023'});
});
test('expired or forged lease cannot deliver/reject; recovery uses a new fencing token',async()=>{
  const f=await launchEvent();const old=(await claim())[0];
  assert.equal(await deliver({...old,lease_token:randomUUID()}),'stale');await expireLease(old.id);
  assert.equal(await deliver(old),'stale');assert.equal(await rejectJob(old),'stale');
  const current=(await claim())[0];assert.notEqual(current.lease_token,old.lease_token);
  assert.equal(await deliver(old),'stale');assert.equal(await deliver(current),'delivered');assert.equal(await deliver(current),'stale');
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications WHERE outbox_id=$1',[f.event.id])).rows[0].count,'2');
});
test('retry backoff defers claims, fifth failure is retained without another delivery attempt',async()=>{
  const f=await launchEvent();
  for(let attempt=1;attempt<=5;attempt++){
    const job=(await claim())[0];assert.equal(await rejectJob(job),attempt===5?'failed':'retry');
    const row=(await pool.query('SELECT *,extract(epoch FROM available_at-clock_timestamp()) AS delay FROM sixtysix.outbox WHERE id=$1',[f.event.id])).rows[0];
    assert.equal(row.attempts,attempt);assert(Number(row.delay)>30*2**(attempt-1)-2);assert(Number(row.delay)<=30*2**(attempt-1));
    assert.equal((await claim()).length,0);await availableNow(job.id);
  }
  assert.equal((await claim()).length,0);assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'0');
});
test('worker crashes consume bounded attempts and expired fifth lease is parked with audit',async()=>{
  const f=await launchEvent();for(let i=0;i<5;i++){const job=(await claim())[0];await expireLease(job.id);}
  assert.equal((await claim()).length,0);const row=(await pool.query('SELECT * FROM sixtysix.outbox WHERE id=$1',[f.event.id])).rows[0];
  assert(row.failed_at);assert.equal(row.attempts,5);assert.equal(row.last_error_code,'ATTEMPTS_EXHAUSTED');assert.equal(row.lease_token,null);
  assert.equal((await pool.query("SELECT count(*) FROM sixtysix.audit_events WHERE target_id=$1 AND action='outbox.failed'",[f.event.id])).rows[0].count,'1');
});
test('invalid event shapes/types and missing cohort are failed without notification or false delivery',async()=>{
  for(const patch of [{event_type:'unknown'},{payload:{}},{payload:{cohortId:'invalid',participantCount:2}},{payload:{cohortId:randomUUID(),participantCount:2}}]){
    const f=await launchEvent();if(patch.event_type)await pool.query('UPDATE sixtysix.outbox SET event_type=$2 WHERE id=$1',[f.event.id,patch.event_type]);
    else await pool.query('UPDATE sixtysix.outbox SET payload=$2 WHERE id=$1',[f.event.id,JSON.stringify(patch.payload)]);
    const result=await runOutbox(workerPool,{batch:20,apply:true});assert.equal(result.counts.failed,1);assert.equal(result.status.delivered,0);
    assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'0');
  }
});
test('notification/audit failure rolls back delivery; worker schedules retry then succeeds once',async()=>{
  const f=await launchEvent();await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_outbox_audit CHECK(target_id<>'${f.event.id}'::uuid OR action<>'outbox.delivered')`);
  try{const result=await runOutbox(workerPool,{batch:20,apply:true});assert.equal(result.counts.retried,1);assert.equal(result.status.delivered,0);}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_outbox_audit');}
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'0');await availableNow(f.event.id);
  assert.equal((await runOutbox(workerPool,{batch:20,apply:true})).counts.delivered,1);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'2');
});
test('suspended/left users receive no new inbox rows and revoked sessions cannot read',async()=>{
  const f=await launchEvent();await pool.query('UPDATE sixtysix.app_users SET suspended_at=now() WHERE id=$1',[f.users[0].userId]);
  await pool.query('UPDATE sixtysix.memberships SET left_at=now() WHERE id=$1',[f.members[1].id]);
  await runOutbox(workerPool,{batch:20,apply:true});assert.equal((await pool.query('SELECT count(*) FROM sixtysix.notifications')).rows[0].count,'0');
  await rejected(new NotificationService(runtimePool).list(f.users[0].token),'UNAUTHENTICATED');
  await core.logout(f.users[1].token);await rejected(new NotificationService(runtimePool).list(f.users[1].token),'UNAUTHENTICATED');
});
test('notification HTTP enforces session ownership and rejects caller-selected user IDs',async()=>{
  const f=await launchEvent();await runOutbox(workerPool,{batch:20,apply:true});const reader=new NotificationService(runtimePool);
  const old={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';const app=createApp(undefined,undefined,undefined,undefined,undefined,()=>reader);
  try{
    assert.equal((await app.inject('/v1/me/notifications')).statusCode,401);
    const headers={cookie:`__Host-sixtysix.session=${f.users[0].token}`};
    const result=await app.inject({url:'/v1/me/notifications',headers});assert.equal(result.statusCode,200,result.body);assert.equal(result.json().items.length,1);assert.equal(result.headers['cache-control'],'no-store');
    assert.equal((await app.inject({url:`/v1/me/notifications?userId=${f.users[1].userId}`,headers})).statusCode,400);
    const other=await app.inject({url:'/v1/me/notifications',headers:{cookie:`__Host-sixtysix.session=${f.withdrawn.token}`}});assert.deepEqual(other.json(),{items:[]});
  }finally{await app.close();for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('inbox is newest-first, capped at fifty and never returns another account rows',async()=>{
  const f=await launchEvent();
  await pool.query(`WITH events AS (
    INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload)
    SELECT 'cohort.started',gen_random_uuid()::text,'{}'::jsonb FROM generate_series(1,55) RETURNING id
  ) INSERT INTO sixtysix.notifications(user_id,outbox_id,membership_id,cohort_id,event_type)
    SELECT $1,id,$2,$3,'cohort.started' FROM events`,[f.users[0].userId,f.members[0].id,f.c.id]);
  const reader=new NotificationService(runtimePool);const list=await reader.list(f.users[0].token);
  assert.equal(list.items.length,50);assert.equal((await reader.list(f.users[1].token)).items.length,0);
  for(let i=1;i<list.items.length;i++)assert(list.items[i-1].createdAt>=list.items[i].createdAt);
});

const { AdminService }=await import('../../sixtysix-v2/server/admin/service.ts');
async function operator(role='admin'){
  const user=await login();await pool.query('INSERT INTO sixtysix.operator_roles(user_id,role) VALUES($1,$2)',[user.userId,role]);return user;
}
async function creation(){const c=await recruitment();return {habitId:c.habit,policyVersion:1,generation:randomUUID(),startDate:new Date(Date.now()+7*DAY_MS).toISOString().slice(0,10),recruitmentOpensAt:new Date(Date.now()-3600000).toISOString(),capacity:30,minParticipants:10};}
const adminCreate=(svc,user,body,key=randomUUID())=>svc.command(user.token,key,{kind:'create',body});
const adminCancel=(svc,user,id,reason='운영 일정 변경',key=randomUUID())=>svc.command(user.token,key,{kind:'cancel',id,reason});
test('only active admin sessions manage recruitment; moderator and ordinary users cannot escalate',async()=>{
  const svc=new AdminService(runtimePool),body=await creation();
  for(const user of [await login(),await operator('moderator')]){
    await rejected(svc.list(user.token),'FORBIDDEN');await rejected(adminCreate(svc,user,body),'FORBIDDEN');
    await assert.rejects(runtimePool.query('SELECT sixtysix.admin_create_cohort($1,$2,$3)',[digest(user.token),randomUUID(),JSON.stringify(body)]),e=>e.code==='P0001'&&e.message==='FORBIDDEN');
  }
  const adminUser=await operator();await pool.query('UPDATE sixtysix.app_users SET suspended_at=now() WHERE id=$1',[adminUser.userId]);
  await rejected(adminCreate(svc,adminUser,body),'UNAUTHENTICATED');
  await assert.rejects(runtimePool.query("INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants) VALUES($1,1,'bypass',now(),now(),30,10)",[body.habitId]),{code:'42501'});
  await assert.rejects(workerPool.query('SELECT sixtysix.require_admin($1,false)',[digest(adminUser.token)]),{code:'42501'});
});
test('operator writes require fresh reauthentication, list remains available and replay rechecks role',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation(),key=randomUUID();
  const made=await adminCreate(svc,user,body,key);
  await pool.query("UPDATE sixtysix.auth_sessions SET reauthenticated_at=clock_timestamp()-interval '6 minutes' WHERE token_hash=$1",[digest(user.token)]);
  await svc.list(user.token);await rejected(adminCreate(svc,user,body,key),'REAUTH_REQUIRED');await rejected(adminCancel(svc,user,made.id),'REAUTH_REQUIRED');
  const proof=await core.recordVerifiedProof({provider:'email',subject:user.subject,purpose:'reauth',sessionToken:user.token,browserBinding:binding});await core.reauthenticate(user.token,proof,binding);
  assert.deepEqual(await adminCreate(svc,user,body,key),made);
  await pool.query('DELETE FROM sixtysix.operator_roles WHERE user_id=$1',[user.userId]);await rejected(adminCreate(svc,user,body,key),'FORBIDDEN');
});
test('create computes 04:00 KST, preserves explicit minimum, audits and replays once under concurrency',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation(),key=randomUUID();body.minParticipants=2;
  const [a,b]=await Promise.all([adminCreate(svc,user,body,key),adminCreate(new AdminService(runtimePool),user,body,key)]);assert.deepEqual(a,b);
  assert.equal(a.startsAt,new Date(`${body.startDate}T04:00:00+09:00`).toISOString());
  assert.equal(a.minParticipants,2);assert.equal(a.generation,body.generation);assert.equal(a.status,'recruiting');
  assert.equal((await pool.query("SELECT count(*) FROM sixtysix.audit_events WHERE target_id=$1 AND action='cohort.create'",[a.id])).rows[0].count,'1');
  await rejected(adminCreate(svc,user,{...body,capacity:29},key),'IDEMPOTENCY_CONFLICT');
  assert((await new CohortService(runtimePool).list({habitId:body.habitId})).items.some(c=>c.id===a.id));
});
test('two administrators racing the same habit/generation cannot create duplicate cohorts',async()=>{
  const svc=new AdminService(runtimePool),body=await creation(),users=[await operator(),await operator()];
  const results=await Promise.allSettled(users.map(u=>adminCreate(svc,u,body)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.reason?.code==='COHORT_EXISTS').length,1);
});
test('creation rejects invalid dates/order/capacity/retired habits without success receipt',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation();
  for(const extra of [{startDate:'2000-01-01'},{recruitmentOpensAt:new Date(`${body.startDate}T04:00:00+09:00`).toISOString()},{minParticipants:31},{minParticipants:0},{capacity:0},{generation:'   '},{policyVersion:2}])await rejected(adminCreate(svc,user,{...body,...extra}),'INVALID_REQUEST');
  await assert.rejects(runtimePool.query('SELECT sixtysix.admin_create_cohort($1,$2,$3)',[digest('fake-session'),randomUUID(),JSON.stringify(body)]),e=>e.message==='UNAUTHENTICATED');
  const bad=(await runtimePool.query('SELECT sixtysix.admin_create_cohort($1,$2,$3) AS value',[digest(user.token),randomUUID(),JSON.stringify({...body,startDate:'2030-02-31'})])).rows[0].value;assert.equal(bad.error,'INVALID_REQUEST');
  await pool.query('UPDATE sixtysix.habits SET retired_at=now() WHERE id=$1',[body.habitId]);await rejected(adminCreate(svc,user,body),'NOT_FOUND');
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.idempotency_records WHERE user_id=$1',[user.userId])).rows[0].count,'0');
});
test('operator pre-start cancellation atomically records reason audit and member inbox event',async()=>{
  await emptyQueue();const svc=new AdminService(runtimePool),user=await operator(),body=await creation();const c=await adminCreate(svc,user,body);
  const participant=await login();await join(new CohortService(runtimePool),participant,c.id);const key=randomUUID();
  const cancelled=await adminCancel(svc,user,c.id,'  시설 점검으로 취소합니다  ',key);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.cancellationReason,'시설 점검으로 취소합니다');
  assert.deepEqual(await adminCancel(svc,user,c.id,'시설 점검으로 취소합니다',key),cancelled);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${c.id}`])).rows[0].count,'1');
  await runOutbox(workerPool,{batch:20,apply:true});assert.equal((await new NotificationService(runtimePool).list(participant.token)).items[0].type,'cohort.cancelled');
  const next=await recruitment();await join(new CohortService(runtimePool),participant,next.id); // lazy slot release
  await rejected(join(new CohortService(runtimePool),await login(),c.id),'JOIN_CLOSED');
  await rejected(adminCancel(svc,user,c.id,'different'),'JOIN_CLOSED');
});
test('cancellation refuses started cohorts and serializes a simultaneous participant join',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation();const started=await adminCreate(svc,user,body);await pastStart(started.id);
  await rejected(adminCancel(svc,user,started.id),'JOIN_CLOSED');
  const future=await adminCreate(svc,user,{...body,generation:randomUUID()}),participant=await login();
  const results=await Promise.allSettled([join(new CohortService(runtimePool),participant,future.id),adminCancel(svc,user,future.id)]);
  assert.equal(results[1].status,'fulfilled');assert(results[0].status==='fulfilled'||results[0].reason.code==='JOIN_CLOSED');
  const event=(await pool.query('SELECT payload FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${future.id}`])).rows[0];
  assert.equal(event.payload.participantCount,results[0].status==='fulfilled'?1:0);
});
test('operator audit failure rolls back create/cancel including outbox and success receipt',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation();
  await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_operator_create CHECK(actor_id<>'${user.userId}'::uuid OR action<>'cohort.create')`);
  try{await assert.rejects(adminCreate(svc,user,body));}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_operator_create');}
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.cohorts WHERE habit_id=$1 AND generation=$2',[body.habitId,body.generation])).rows[0].count,'0');
  const made=await adminCreate(svc,user,body);const key=randomUUID();
  await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_operator_cancel CHECK(actor_id<>'${user.userId}'::uuid OR action<>'cohort.cancel')`);
  try{await assert.rejects(adminCancel(svc,user,made.id,'운영 취소',key));}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_operator_cancel');}
  assert.equal((await pool.query('SELECT cancelled_at FROM sixtysix.cohorts WHERE id=$1',[made.id])).rows[0].cancelled_at,null);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${made.id}`])).rows[0].count,'0');
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.idempotency_records WHERE user_id=$1 AND key=$2',[user.userId,key])).rows[0].count,'0');
  await adminCancel(svc,user,made.id,'운영 취소',key);
});
test('operator HTTP enforces CSRF schema privileges and returns contractual create/cancel response',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation();const old={APP_ORIGIN:process.env.APP_ORIGIN,AUTH_CONTEXT_SECRET:process.env.AUTH_CONTEXT_SECRET};
  process.env.APP_ORIGIN='https://app.example.test';process.env.AUTH_CONTEXT_SECRET='test-only-0123456789abcdef0123456789abcdef';
  const app=createApp(undefined,undefined,undefined,undefined,undefined,undefined,()=>svc);
  try{
    assert.equal((await app.inject('/v1/admin/cohorts')).statusCode,401);
    const context=await app.inject('/v1/auth/context');const headers={cookie:`${context.headers['set-cookie'].split(';')[0]}; __Host-sixtysix.session=${user.token}`,origin:'https://app.example.test','x-csrf-token':context.json().csrfToken,'idempotency-key':randomUUID()};
    assert.equal((await app.inject({method:'POST',url:'/v1/admin/cohorts',headers:{...headers,origin:'https://evil.test'},payload:body})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/v1/admin/cohorts',headers,payload:{...body,userId:user.userId}})).statusCode,400);
    const made=await app.inject({method:'POST',url:'/v1/admin/cohorts',headers,payload:body});assert.equal(made.statusCode,201,made.body);
    const page=await app.inject({url:'/v1/admin/cohorts',headers});assert.equal(page.statusCode,200);assert.equal(page.headers['cache-control'],'no-store');
    const cancelled=await app.inject({method:'POST',url:`/v1/admin/cohorts/${made.json().id}/cancel`,headers:{...headers,'idempotency-key':randomUUID()},payload:{reason:'운영 일정 변경'}});assert.equal(cancelled.statusCode,200,cancelled.body);
    const ordinary=await login();const denied=await app.inject({url:'/v1/admin/cohorts',headers:{cookie:`__Host-sixtysix.session=${ordinary.token}`}});assert.equal(denied.statusCode,403);assert(!denied.body.includes(body.generation));
  }finally{await app.close();for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('operator rejected commands share the existing account quota',async()=>{
  const svc=new AdminService(runtimePool),user=await operator();
  for(let i=0;i<20;i++)await rejected(adminCancel(svc,user,randomUUID()),'NOT_FOUND');
  await rejected(adminCancel(svc,user,randomUUID()),'RATE_LIMITED');assert.equal(await businessHits(user.userId),20);
});
test('operator pagination returns newest-first pages without losing equal-start cohorts',async()=>{
  const svc=new AdminService(runtimePool),user=await operator(),body=await creation();
  await pool.query(`INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
    SELECT $1,1,gen_random_uuid()::text,'2090-01-01 04:00:00+09'::timestamptz,now(),30,10 FROM generate_series(1,55)`,[body.habitId]);
  const first=await svc.list(user.token);assert.equal(first.items.length,50);assert(first.nextCursor);
  const second=await svc.list(user.token,first.nextCursor);const ids=[...first.items,...second.items].map(c=>c.id);assert.equal(new Set(ids).size,ids.length);
  const all=[...first.items,...second.items];for(let i=1;i<all.length;i++)assert(all[i-1].startsAt>=all[i].startsAt);
});

const {runScheduledWork}=require('../backend/scripts/run-scheduled-work.cjs');
const settle=async(batch=20,dry=true)=>(await workerPool.query('SELECT sixtysix.settle_due_cohorts($1,$2) AS value',[batch,dry])).rows[0].value;
async function scheduledFixture({minimum=1,members=1}={}){
  const c=await recruitment({min:minimum}),users=[];
  for(let i=0;i<members;i++){const user=await login();users.push(user);await join(new CohortService(runtimePool),user,c.id);}
  await pastStart(c.id);return {c,users};
}
async function isolateScheduled(){
  // Fixtures from prior tests may be due. Settle and clear only this disposable DB.
  for(let i=0;i<20;i++){const r=await settle(100,false);if(!r.batchFull)break;}
  await emptyQueue();
}
test('scheduled launch/status capabilities are worker-only, app and PUBLIC stay denied',async()=>{
  await verifyRuntime(runtimePool,runtimeRole);await verifyWorker(workerPool,workerRole);
  await assert.rejects(runtimePool.query('SELECT sixtysix.settle_due_cohorts(1,false)'),{code:'42501'});
  await assert.rejects(runtimePool.query('SELECT sixtysix.scheduled_work_status()'),{code:'42501'});
  const publicGrant=await pool.query(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='sixtysix' AND p.proname IN ('settle_due_cohorts','scheduled_work_status') AND a.grantee=0 AND a.privilege_type='EXECUTE'`);
  assert.equal(publicGrant.rows[0].count,'0');
  for(const args of [[0,true],[101,true],[null,true],[1,null]])await assert.rejects(workerPool.query('SELECT sixtysix.settle_due_cohorts($1,$2)',args),{code:'22023'});
});
test('scheduled dry-run leaves overdue cohorts and inbox unchanged; apply starts/cancels and delivers',async()=>{
  await isolateScheduled();const started=await scheduledFixture(),cancelled=await scheduledFixture({minimum:2});const future=await recruitment();
  const dry=await runScheduledWork(workerPool,{batch:20,apply:false});assert.equal(dry.launch.due,2);assert.equal(dry.status.dueCohorts,2);assert.equal(dry.delivery.counts.delivered,0);
  assert.equal((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[started.c.id])).rows[0].launch_decided_at,null);
  const result=await runScheduledWork(workerPool,{batch:20,apply:true});assert.equal(result.launch.started,1);assert.equal(result.launch.cancelled,1);assert.equal(result.delivery.counts.delivered,2);assert.equal(result.status.dueCohorts,0);
  const inbox=new NotificationService(runtimePool);assert.equal((await inbox.list(started.users[0].token)).items[0].type,'cohort.started');assert.equal((await inbox.list(cancelled.users[0].token)).items[0].type,'cohort.cancelled');
  assert.equal((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[future.id])).rows[0].launch_decided_at,null);
  assert.equal((await runScheduledWork(workerPool,{batch:20,apply:true})).launch.due,0);
});
test('scheduled launch races with lazy app launch but produces one decision and one event',async()=>{
  await isolateScheduled();const f=await scheduledFixture();
  await Promise.all([settle(20,false),new CohortService(runtimePool).detail(f.c.id),settle(20,false)]);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${f.c.id}`])).rows[0].count,'1');
  assert.equal((await runScheduledWork(workerPool,{batch:20,apply:true})).delivery.counts.delivered,1);
});
test('overlapping launch workers skip locked cohorts and obey each batch limit',async()=>{
  await isolateScheduled();const a=await scheduledFixture(),b=await scheduledFixture(),c=await scheduledFixture();const held=await pool.connect();
  try{
    await held.query('BEGIN');await held.query('SELECT id FROM sixtysix.cohorts WHERE id=$1 FOR UPDATE',[a.c.id]);
    const results=await Promise.all([settle(1,false),settle(1,false)]);assert.equal(results.reduce((n,r)=>n+r.due,0),2);
    assert.equal((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[a.c.id])).rows[0].launch_decided_at,null);
  }finally{await held.query('ROLLBACK');held.release();}
  const last=await settle(1,false);assert.equal(last.due,1);
  for(const f of [a,b,c])assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${f.c.id}`])).rows[0].count,'1');
});
test('scheduled launch rolls back its decision and event when audit insertion fails',async()=>{
  await isolateScheduled();const f=await scheduledFixture();
  await pool.query(`ALTER TABLE sixtysix.audit_events ADD CONSTRAINT test_schedule_audit CHECK(target_id<>'${f.c.id}'::uuid OR action NOT IN ('cohort.started','cohort.cancelled'))`);
  try{await assert.rejects(settle(20,false));}finally{await pool.query('ALTER TABLE sixtysix.audit_events DROP CONSTRAINT test_schedule_audit');}
  assert.equal((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[f.c.id])).rows[0].launch_decided_at,null);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${f.c.id}`])).rows[0].count,'0');
  assert.equal((await runScheduledWork(workerPool,{batch:20,apply:true})).delivery.counts.delivered,1);
});
test('a crash between launch and delivery is recovered without relaunching the cohort',async()=>{
  await isolateScheduled();const f=await scheduledFixture();await settle(20,false);
  const before=(await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[f.c.id])).rows[0].launch_decided_at;
  const resumed=await runScheduledWork(workerPool,{batch:20,apply:true});assert.equal(resumed.launch.due,0);assert.equal(resumed.delivery.counts.delivered,1);
  assert.deepEqual((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[f.c.id])).rows[0].launch_decided_at,before);
});
test('operator-cancelled and already-decided cohorts never get a second scheduled decision',async()=>{
  await isolateScheduled();const user=await operator(),svc=new AdminService(runtimePool);const made=await adminCreate(svc,user,await creation());await adminCancel(svc,user,made.id);await pastStart(made.id);
  const before=(await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[made.id])).rows[0].launch_decided_at;
  assert.equal((await settle(20,false)).due,0);assert.deepEqual((await pool.query('SELECT launch_decided_at FROM sixtysix.cohorts WHERE id=$1',[made.id])).rows[0].launch_decided_at,before);
  assert.equal((await pool.query('SELECT count(*) FROM sixtysix.outbox WHERE dedupe_key=$1',[`cohort.launch:${made.id}`])).rows[0].count,'1');
});
test('scheduled CLI fails visibly on retained failed jobs without printing secrets or payloads',async()=>{
  await isolateScheduled();await pool.query("INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload) VALUES('unknown',gen_random_uuid()::text,'{\"private\":\"do-not-log\"}'::jsonb)");
  const workerUrl=new URL(url);workerUrl.username=workerRole;workerUrl.password=workerPassword;
  const result=require('node:child_process').spawnSync(process.execPath,[new URL('./run-scheduled-work.cjs',import.meta.url).pathname,'--apply','--batch=1'],{
    encoding:'utf8',env:{...process.env,WORKER_DATABASE_URL:workerUrl.toString()}
  });
  assert.equal(result.status,1);assert.equal(result.stderr.trim(),'OUTBOX_FAILED_JOBS_PRESENT');
  const output=JSON.parse(result.stdout);assert.equal(output.delivery.counts.failed,1);assert.equal(output.status.outbox.failed,1);
  for(const secret of [workerPassword,workerUrl.toString(),'do-not-log'])assert(!(result.stdout+result.stderr).includes(secret));
});
