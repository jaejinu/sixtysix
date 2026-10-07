// Remote smoke check. Vercel CLI handles deployment protection.
// --kakao-ready creates one short-lived OAuth state, but does not exchange a code or create a user.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = new URL(process.argv[2]);
const kakaoReady = process.argv[3] === '--kakao-ready';
const contextReady = kakaoReady || process.argv[3] === '--context-ready';
assert.ok(process.argv.length <= 4 && (!process.argv[3] || contextReady), 'Invalid options');
assert.ok(base.protocol === 'https:' && base.hostname.startsWith('sixtysix-v2-') && base.hostname.endsWith('.vercel.app'));
assert.equal(base.pathname, '/');
assert.ok(!base.username && !base.password && !base.search && !base.hash);
function get(path, args = []) {
  const output = execFileSync('vercel', ['curl', path, '--deployment', base.origin, '--',
    '--silent', '--show-error', '--max-time', '30', '--include', '--write-out', '\n%{http_code}', ...args],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 2000000, stdio: ['ignore', 'pipe', 'pipe'] });
  const end = output.lastIndexOf('\n');
  const status = Number(output.slice(end + 1));
  const raw = output.slice(0, end);
  const split = raw.lastIndexOf('\r\n\r\n');
  assert.ok(split >= 0, 'Missing HTTP headers');
  return { status, rawHeaders: raw.slice(0, split), headers: raw.slice(0, split).toLowerCase(), body: raw.slice(split + 4) };
}
try {
  let browserContext;
  const cases = [
    ['/v1/health', 200, data => assert.equal(data.status, 'ok')],
    ['/v1/ready', 200, data => assert.equal(data.status, 'ok')],
    ['/v1/habits', 200, data => assert.ok(Array.isArray(data.items))],
    ['/v1/cohorts', 200, data => assert.ok(Array.isArray(data.items))],
    ['/v1/cohorts?limit=0', 400],
    ['/v1/not-a-route', 404],
    ['/v1/auth/context', contextReady ? 200 : 503, ...(contextReady ? [data => assert.match(data.csrfToken, /^[A-Za-z0-9_-]{43}$/)] : [])],
    ...(!kakaoReady ? [['/v1/auth/kakao/start', 503]] : []),
    ['/v1/me', contextReady ? 401 : 503],
    ['/v1/me/notifications', contextReady ? 401 : 503],
    ['/v1/admin/cohorts', contextReady ? 401 : 503],
  ];
  for (const [path, status, check] of cases) {
    const response = get(path);
    assert.equal(response.status, status, path);
    assert.match(response.headers, /cache-control:.*no-store/);
    assert.match(response.headers, /content-type:.*application\/json/);
    const data = JSON.parse(response.body);
    if (check) check(data);
    if (contextReady && path === '/v1/auth/context') {
      browserContext = response;
      assert.match(response.headers, /set-cookie: __host-sixtysix\.context=/);
      for (const flag of ['httponly', 'secure', 'samesite=lax', 'path=/']) assert.ok(response.headers.includes(flag));
      assert.doesNotMatch(response.headers, /;\s*domain=/);
    }
    if (status >= 400) {
      assert.ok(data.error?.requestId);
      assert.equal(data.error.code, status === 503 ? 'TEMPORARILY_UNAVAILABLE' : status === 401 ? 'UNAUTHENTICATED' : status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST');
      assert.deepEqual(Object.keys(data.error).sort(), ['code', 'message', 'requestId']);
    }
    console.log(`PASS ${status} ${path}`);
  }
  if (kakaoReady) {
    const response = get('/v1/auth/kakao/start');
    assert.equal(response.status, 302);
    const location = response.rawHeaders.match(/(?:^|\r\n)location: ([^\r\n]+)/i)?.[1];
    assert.ok(location);
    const target = new URL(location);
    assert.equal(target.origin, 'https://kauth.kakao.com');
    assert.equal(target.pathname, '/oauth/authorize');
    assert.equal(target.searchParams.get('redirect_uri'), `${base.origin}/v1/auth/kakao/callback`);
    assert.equal(target.searchParams.get('response_type'), 'code');
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(target.searchParams.get('state'));
    assert.ok(target.searchParams.get('client_id'));
    assert.ok(!target.searchParams.has('client_secret') && !target.searchParams.has('scope'));
    console.log('PASS 302 Kakao authorization redirect, exact callback and minimal scope');
  }
  if (contextReady) {
    const token = JSON.parse(browserContext.body).csrfToken;
    const cookie = browserContext.rawHeaders.match(/set-cookie: (__Host-sixtysix\.context=[^;]+)/i)?.[1];
    assert.ok(cookie);
    const headers = ['--request', 'POST', '--header', `Cookie: ${cookie}`, '--header', `X-CSRF-Token: ${token}`];
    for (const origin of ['', 'https://untrusted.example']) {
      const response = get('/v1/auth/logout', [...headers, ...(origin ? ['--header', `Origin: ${origin}`] : [])]);
      assert.equal(response.status, 403); assert.equal(JSON.parse(response.body).error.code, 'FORBIDDEN');
      console.log(`PASS 403 logout ${origin ? 'foreign' : 'missing'} Origin`);
    }
    // Anonymous logout checks the valid browser context without a user session or DB mutation.
    const response = get('/v1/auth/logout', [...headers, '--header', `Origin: ${base.origin}`]);
    assert.equal(response.status, 204); console.log('PASS 204 anonymous logout with valid context');
  }
  const home = get('/home');
  assert.equal(home.status, 200);
  assert.match(home.body, /<div id="root"><\/div>/);
  const assets = [...home.body.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')));
  for (const path of assets) {
    const response = get(path); assert.equal(response.status, 200); assert.ok(response.body.length > 100);
    assert.doesNotMatch(response.body, /<html/i); console.log(`PASS asset ${path}`);
  }
  for (const path of ['/brand/logo-mark.svg', '/brand/logo-mark-small.svg', '/brand/favicon.svg']) {
    const response = get(path); assert.equal(response.status, 200);
    assert.match(response.headers, /content-type:.*image\/svg\+xml/);
    assert.match(response.body, /<svg\b/); assert.doesNotMatch(response.body, /<html/i);
    console.log(`PASS brand ${path}`);
  }
  for (const path of ['/login', '/account', '/recruitment', '/notifications', '/admin/cohorts']) {
    const response = get(path); assert.equal(response.status, 200); assert.equal(response.body, home.body);
    console.log(`PASS SPA ${path}`);
  }
  console.log('PASS: Preview API, database, auth boundary, assets and SPA routes');
} catch (error) {
  // Never print CLI stderr, raw response bodies, cookies or bypass credentials.
  console.error('PREVIEW_HTTP_CHECK_FAILED', error.code || error.name);
  process.exitCode = 1;
}
