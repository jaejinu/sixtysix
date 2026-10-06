// Isolated library behavior probe. No production routes, credentials or emails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { memoryAdapter } from 'better-auth/adapters/memory';

const origin = 'https://auth.example.test';
const profile = (email, id = 101) => ({ id, kakao_account: {
  ...(email ? { email, is_email_valid: true, is_email_verified: true } : {}),
  profile: { nickname: '검증 사용자' },
} });

async function fixture(run) {
  const db = { user: [], session: [], account: [], verification: [] };
  const mailbox = new Map();
  let providerProfile = profile('kakao@example.test');
  let callbackPath;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://kauth.kakao.com/oauth/token')) {
      return Response.json({ access_token: 'local-fake-provider-token', token_type: 'bearer', expires_in: 3600 });
    }
    if (url.startsWith('https://kapi.kakao.com/v2/user/me')) return Response.json(providerProfile);
    throw new Error('Unexpected network request in isolated auth spike');
  };
  const auth = betterAuth({
    baseURL: origin, secret: 'local-spike-only-77ff88ee99dd00cc11bb22aa33xx44yy',
    database: memoryAdapter(db), logger: { disabled: true }, rateLimit: { enabled: false },
    account: { accountLinking: { enabled: true, disableImplicitLinking: true,
      allowDifferentEmails: true, allowUnlinkingAll: false } },
    session: { freshAge: 300, cookieCache: { enabled: false } },
    socialProviders: { kakao: { clientId: 'local-client', clientSecret: 'local-secret',
      disableDefaultScope: true, scope: ['profile_nickname'] } },
    plugins: [emailOTP({ otpLength: 6, expiresIn: 300, allowedAttempts: 3, storeOTP: 'hashed',
      async sendVerificationOTP({ email, otp }) { mailbox.set(email, otp); } })],
  });
  const jar = new Map();
  async function request(path, body, method = body ? 'POST' : 'GET') {
    const response = await auth.handler(new Request(origin + '/api/auth' + path, {
      method, headers: { origin, 'content-type': 'application/json',
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      if (/max-age=0/i.test(cookie)) jar.delete(name);
      else jar.set(name, pair.slice(index + 1));
    }
    return response;
  }
  async function send(email) {
    const response = await request('/email-otp/send-verification-otp', { email, type: 'sign-in' });
    assert.equal(response.status, 200);
    assert.match(mailbox.get(email), /^\d{6}$/);
    return mailbox.get(email);
  }
  async function otpLogin(email) {
    return request('/sign-in/email-otp', { email, otp: await send(email) });
  }
  async function oauth(p, link = false) {
    providerProfile = p;
    const started = await request(link ? '/link-social' : '/sign-in/social', {
      provider: 'kakao', callbackURL: '/done', errorCallbackURL: '/failed',
    });
    assert.equal(started.status, 200);
    const { url } = await started.json();
    const state = new URL(url).searchParams.get('state');
    assert.ok(state);
    callbackPath = `/callback/kakao?code=local-code&state=${encodeURIComponent(state)}`;
    return request(callbackPath);
  }
  try { await run({ db, auth, jar, request, send, otpLogin, oauth, get callbackPath() { return callbackPath; } }); }
  finally { globalThis.fetch = originalFetch; }
}

test('OTP creates a session, stores a hash, and rejects replay', async () => fixture(async f => {
  const email = 'otp@example.test';
  const otp = await f.send(email);
  assert.equal(JSON.stringify(f.db.verification).includes(otp), false);
  const response = await f.request('/sign-in/email-otp', { email, otp });
  assert.equal(response.status, 200);
  assert.equal(f.db.user.length, 1);
  assert.equal(f.db.session.length, 1);
  assert.ok(response.headers.getSetCookie().some(value => /HttpOnly/i.test(value) && /Secure/i.test(value)));
  assert.equal((await f.request('/sign-in/email-otp', { email, otp })).status, 400);
}));

test('OTP attempt limit rejects even the correct code after three failures', async () => fixture(async f => {
  const email = 'limit@example.test'; const otp = await f.send(email);
  const wrong = otp === '000000' ? '111111' : '000000';
  for (let n = 0; n < 3; n++) assert.equal((await f.request('/sign-in/email-otp', { email, otp: wrong })).status, 400);
  assert.notEqual((await f.request('/sign-in/email-otp', { email, otp })).status, 200);
  assert.equal(f.db.session.length, 0);
}));

test('Kakao with an email creates a provider account and session (mock transport)', async () => fixture(async f => {
  const response = await f.oauth(profile('social@example.test'));
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/done');
  assert.equal(f.db.account[0].providerId, 'kakao');
  assert.equal(f.db.session.length, 1);
}));

test('GAP: Kakao login without email is rejected by the default callback', async () => fixture(async f => {
  const response = await f.oauth(profile(undefined));
  assert.equal(new URL(response.headers.get('location'), origin).searchParams.get('error'), 'email_not_found');
  assert.equal(f.db.user.length, 0);
  assert.equal(f.db.session.length, 0);
}));

test('Implicit OAuth linking is disabled for an existing OTP user', async () => fixture(async f => {
  assert.equal((await f.otpLogin('same@example.test')).status, 200);
  f.jar.clear();
  const response = await f.oauth(profile('same@example.test'));
  assert.equal(new URL(response.headers.get('location'), origin).searchParams.get('error'), 'account_not_linked');
  assert.equal(f.db.account.length, 0);
  assert.equal(f.db.user.length, 1);
}));

test('GAP: OTP can log into a Kakao-created user without explicit email linking', async () => fixture(async f => {
  await f.oauth(profile('reverse@example.test'));
  const originalId = f.db.user[0].id;
  f.jar.clear();
  const response = await f.otpLogin('reverse@example.test');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, originalId);
  assert.equal(f.db.account.length, 1);
  assert.equal(f.db.account[0].providerId, 'kakao');
}));

test('Explicit Kakao linking retains the existing OTP user', async () => fixture(async f => {
  const signedIn = await (await f.otpLogin('explicit@example.test')).json();
  const response = await f.oauth(profile('other@example.test'), true);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/done');
  assert.equal(f.db.user.length, 1);
  assert.equal(f.db.account[0].userId, signedIn.user.id);
}));

test('GAP: unlink guard counts provider accounts, not a usable OTP login', async () => fixture(async f => {
  await f.otpLogin('unlink@example.test');
  await f.oauth(profile('other@example.test'), true);
  const result = await f.request('/unlink-account', { providerId: 'kakao', accountId: f.db.account[0].accountId });
  assert.notEqual(result.status, 200);
  assert.equal((await result.json()).code, 'FAILED_TO_UNLINK_LAST_ACCOUNT');
}));

test('Logout invalidates the current session', async () => fixture(async f => {
  await f.otpLogin('logout@example.test');
  assert.equal((await f.request('/sign-out', {})).status, 200);
  assert.equal(await (await f.request('/get-session')).json(), null);
  assert.equal(f.db.session.length, 0);
}));

test('Expired OTP cannot create a user or session', async () => fixture(async f => {
  const email = 'expired@example.test'; const otp = await f.send(email);
  f.db.verification[0].expiresAt = new Date(Date.now() - 1000);
  assert.notEqual((await f.request('/sign-in/email-otp', { email, otp })).status, 200);
  assert.equal(f.db.user.length, 0); assert.equal(f.db.session.length, 0);
}));

test('Consumed OAuth callback state cannot create another session', async () => fixture(async f => {
  await f.oauth(profile('state@example.test'));
  const count = f.db.session.length;
  const response = await f.request(f.callbackPath);
  assert.ok(new URL(response.headers.get('location'), origin).searchParams.get('error'));
  assert.equal(f.db.session.length, count);
}));

test('A provider account owned by another user cannot be explicitly linked', async () => fixture(async f => {
  await f.otpLogin('owner-a@example.test');
  const cookiesA = [...f.jar];
  f.jar.clear();
  await f.oauth(profile('owner-b@example.test', 202));
  const ownerB = f.db.account[0].userId;
  f.jar.clear(); for (const [key, value] of cookiesA) f.jar.set(key, value);
  const result = await f.oauth(profile('owner-b@example.test', 202), true);
  assert.equal(new URL(result.headers.get('location'), origin).searchParams.get('error'), 'account_already_linked_to_different_user');
  assert.equal(f.db.account[0].userId, ownerB);
  assert.equal(f.db.user.length, 2);
}));
