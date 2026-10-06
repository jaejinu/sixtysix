import { describe, expect, it } from 'vitest';
import { contextConfig, issueContext, verifyContext } from './browser-context.js';

const config = { secret: 'test-only-0123456789abcdef0123456789abcdef', origin: 'https://app.example.test' };
const now = Date.UTC(2026, 9, 5);
const context = () => issueContext(config, undefined, now);
describe('anonymous authentication browser context', () => {
  it('binds a token to an HttpOnly secure cookie and preserves it across tabs', () => {
    const first = context(); const cookie = first.cookie.split(';')[0]!;
    expect(first.cookie).toContain('HttpOnly'); expect(first.cookie).toContain('Secure');
    expect(() => verifyContext(config, { origin: config.origin, cookie, csrfToken: first.csrfToken }, now)).not.toThrow();
    expect(issueContext(config, cookie, now + 1000).csrfToken).toBe(first.csrfToken);
  });
  it('rejects an attacker origin even when token and cookie are correct', () => {
    const value = context();
    expect(() => verifyContext(config, { origin: 'https://attacker.example', cookie: value.cookie, csrfToken: value.csrfToken }, now)).toThrow('FORBIDDEN');
  });
  it('rejects a token copied from another browser', () => {
    expect(() => verifyContext(config, { origin: config.origin, cookie: context().cookie, csrfToken: context().csrfToken }, now)).toThrow('FORBIDDEN');
  });
  it('rejects tampering, duplicated cookies and an expired context', () => {
    const value = context(); const cookie = value.cookie.split(';')[0]!;
    for (const invalid of [cookie + 'x', cookie + '; ' + cookie]) {
      expect(() => verifyContext(config, { origin: config.origin, cookie: invalid, csrfToken: value.csrfToken }, now)).toThrow('FORBIDDEN');
    }
    expect(() => verifyContext(config, { origin: config.origin, cookie, csrfToken: value.csrfToken }, now + 900000)).toThrow('FORBIDDEN');
  });
  it('fails closed for missing secrets or an insecure remote origin', () => {
    expect(() => contextConfig({})).toThrow('TEMPORARILY_UNAVAILABLE');
    expect(() => contextConfig({ AUTH_CONTEXT_SECRET: config.secret, APP_ORIGIN: 'http://remote.example' })).toThrow();
    expect(() => contextConfig({ AUTH_CONTEXT_SECRET: config.secret, APP_ORIGIN: 'http://localhost:5173', VERCEL: '1' })).toThrow();
    expect(contextConfig({ AUTH_CONTEXT_SECRET: config.secret, APP_ORIGIN: 'http://localhost:5173' }).origin).toBe('http://localhost:5173');
  });
});
