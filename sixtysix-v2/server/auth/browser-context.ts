import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const lifetimeMs = 15 * 60 * 1000;
export class AuthContextError extends Error {
  constructor(readonly status: 403 | 503) {
    super(status === 403 ? 'FORBIDDEN' : 'TEMPORARILY_UNAVAILABLE');
  }
}
export interface BrowserContextConfig { secret: string; origin: string }

export function contextConfig(env: NodeJS.ProcessEnv = process.env): BrowserContextConfig {
  const secret = env.AUTH_CONTEXT_SECRET;
  if (!secret || secret.length < 32 || !env.APP_ORIGIN) throw new AuthContextError(503);
  let url: URL;
  try { url = new URL(env.APP_ORIGIN); } catch { throw new AuthContextError(503); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:' && !env.VERCEL)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new AuthContextError(503);
  }
  return { secret, origin: url.origin };
}

function cookieName(config: BrowserContextConfig) {
  return config.origin.startsWith('https:') ? '__Host-sixtysix.context' : 'sixtysix.context';
}
function mac(config: BrowserContextConfig, purpose: string, input: string) {
  return createHmac('sha256', config.secret).update(`${purpose}:${input}`).digest('base64url');
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function readContext(config: BrowserContextConfig, cookies: string | undefined, now: number): string | undefined {
  const matches = (cookies ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName(config)}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0]!.slice(cookieName(config).length + 1);
  const parts = value.split('.');
  if (parts.length !== 3) return undefined;
  const [expires, nonce, signature] = parts as [string, string, string];
  if (!/^\d{13}$/.test(expires) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return undefined;
  const deadline = Number(expires);
  if (deadline <= now || deadline > now + lifetimeMs || !equal(signature, mac(config, 'cookie', `${expires}.${nonce}`))) return undefined;
  return value;
}

export function issueContext(config: BrowserContextConfig, cookies?: string, now = Date.now()) {
  let value = readContext(config, cookies, now);
  if (!value) {
    const payload = `${now + lifetimeMs}.${randomBytes(32).toString('base64url')}`;
    value = `${payload}.${mac(config, 'cookie', payload)}`;
  }
  const maxAge = Math.ceil((Number(value.split('.')[0]) - now) / 1000);
  return { csrfToken: mac(config, 'csrf', value),
    cookie: `${cookieName(config)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.origin.startsWith('https:') ? '; Secure' : ''}` };
}

// Required by future auth POST routes. This proves browser context, not identity.
// After authentication, session ownership/recent reauth are separate checks.
export function verifyContext(config: BrowserContextConfig,
  input: { origin?: string; cookie?: string; csrfToken?: string }, now = Date.now()) {
  const value = readContext(config, input.cookie, now);
  if (input.origin !== config.origin || !value || !input.csrfToken ||
      !equal(input.csrfToken, mac(config, 'csrf', value))) throw new AuthContextError(403);
  return mac(config, 'binding', value);
}

// OAuth returns cross-site as a top-level GET; state + the signed browser cookie
// replace the POST Origin/CSRF-header check for this callback only.
export function oauthBrowserBinding(config: BrowserContextConfig, cookies?: string) {
  const value = readContext(config, cookies, Date.now());
  if (!value) throw new AuthContextError(403);
  return mac(config, 'binding', value);
}
