import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createApp } from '../app.js';
import { issueContext } from './browser-context.js';
import { authBrowser } from './email-routes.js';
import { resendMailer } from './resend-mailer.js';
import { readSessionCookie, sessionCookie } from './session-cookie.js';

const config = { origin: 'https://app.example.test', secret: 'test-only-browser-secret-0123456789abcdef0123456789abcdef' };
function headers() {
  const context = issueContext(config);
  return { cookie: context.cookie.split(';')[0]!, origin: config.origin, 'x-csrf-token': context.csrfToken };
}
describe('email authentication transport boundaries', () => {
  it('fails closed when OTP or sender configuration is absent', async () => {
    vi.stubEnv('APP_ORIGIN', config.origin); vi.stubEnv('AUTH_CONTEXT_SECRET', config.secret);
    vi.stubEnv('VERCEL', ''); vi.stubEnv('AUTH_OTP_SECRET', '');
    const app = createApp({ ready: async () => {}, habits: async () => [] });
    try {
      const request = { method: 'POST' as const, url: '/v1/auth/code', headers: headers(), payload: { email: 'person@example.test' } };
      expect((await app.inject(request)).statusCode).toBe(503);
      vi.stubEnv('AUTH_OTP_SECRET', 'test-only-otp-secret-0123456789abcdef0123456789abcdef');
      vi.stubEnv('RESEND_API_KEY', ''); vi.stubEnv('AUTH_EMAIL_FROM', '');
      const response = await app.inject(request);
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('TEMPORARILY_UNAVAILABLE');
      expect(response.body).not.toContain('person@example.test');
    } finally { await app.close(); vi.unstubAllEnvs(); }
  });

  it('ignores forged forwarded IPs locally and trusts only the Vercel deployment header', () => {
    vi.stubEnv('APP_ORIGIN', config.origin); vi.stubEnv('AUTH_CONTEXT_SECRET', config.secret);
    const request: Pick<FastifyRequest, 'headers' | 'ip'> = { headers: { ...headers(), 'x-forwarded-for': '203.0.113.10' }, ip: '127.0.0.1' };
    try {
      vi.stubEnv('VERCEL', ''); expect(authBrowser(request).ip).toBe('127.0.0.1');
      vi.stubEnv('VERCEL', '1'); expect(authBrowser(request).ip).toBe('203.0.113.10');
      request.headers['x-forwarded-for'] = '203.0.113.10, 198.51.100.1';
      expect(() => authBrowser(request)).toThrow('TEMPORARILY_UNAVAILABLE');
      request.headers['x-forwarded-for'] = '2001:0db8:0:0:0:0:0:1';
      expect(authBrowser(request).ip).toBe('[2001:db8::1]');
    } finally { vi.unstubAllEnvs(); }
  });

  it('sets host-only secure cookies and rejects duplicate or malformed session cookies', () => {
    const token = 'a'.repeat(43);
    const cookie = sessionCookie(config, token, new Date(Date.now() + 60_000));
    expect(cookie).toContain('__Host-sixtysix.session='); expect(cookie).toContain('; Secure');
    expect(cookie).toContain('HttpOnly; SameSite=Lax'); expect(cookie).not.toContain('Domain=');
    expect(readSessionCookie(config, cookie)).toBe(token);
    expect(() => readSessionCookie(config, `${cookie}; __Host-sixtysix.session=${token}`)).toThrow('UNAUTHENTICATED');
    expect(() => readSessionCookie(config, '__Host-sixtysix.session=bad')).toThrow('UNAUTHENTICATED');
    expect(readSessionCookie(config)).toBeUndefined();
    expect(sessionCookie(config, '', new Date(0))).toContain('Max-Age=0');
    const local = { ...config, origin: 'http://localhost:5173' };
    expect(sessionCookie(local, token, new Date(Date.now() + 60_000))).toMatch(/^sixtysix.session=/);
  });

  it('sends only to the fixed Resend endpoint with an idempotency key and timeout', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'message-id' }), { status: 200 }));
    const mailer = resendMailer({ RESEND_API_KEY: 'test-key', AUTH_EMAIL_FROM: '육십육 <login@example.test>' }, transport);
    await mailer.send({ id: 'challenge-id', email: 'person@example.test', code: '001234' });
    expect(transport).toHaveBeenCalledOnce();
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.redirect).toBe('error'); expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ 'Idempotency-Key': 'login-code/challenge-id' });
    expect(JSON.parse(init?.body as string)).toMatchObject({ to: ['person@example.test'], text: expect.stringContaining('001234') });
  });

  it('sanitizes provider failures, invalid success bodies, and timeout errors', async () => {
    for (const response of [new Response('private-key@example.test', { status: 403 }), new Response('{}', { status: 200 })]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(resendMailer({ RESEND_API_KEY: 'test-key', AUTH_EMAIL_FROM: 'login@example.test' }, transport)
        .send({ id: 'id', email: 'person@example.test', code: '123456' })).rejects.toThrow('TEMPORARILY_UNAVAILABLE');
    }
    const timeout = vi.fn<typeof fetch>().mockRejectedValue(new Error('private-provider-timeout-detail'));
    await expect(resendMailer({ RESEND_API_KEY: 'test-key', AUTH_EMAIL_FROM: 'login@example.test' }, timeout)
      .send({ id: 'id', email: 'person@example.test', code: '123456' })).rejects.toThrow('TEMPORARILY_UNAVAILABLE');
    expect(() => resendMailer({})).toThrow('TEMPORARILY_UNAVAILABLE');
  });
});
