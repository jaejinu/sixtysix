import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { kakaoProvider } from './kakao-provider.js';
import { createApp } from '../app.js';
const env = { APP_ORIGIN:'https://app.example.test',AUTH_CONTEXT_SECRET:'test-only-context-012345678901234567890123456789',
  KAKAO_CLIENT_ID:'test-client-id',KAKAO_CLIENT_SECRET:'test-client-secret' };

describe('Kakao confidential-client adapter', () => {
  it('uses exact callback, no extra profile scopes, prompt=login and state-bound PKCE', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"access_token":"test-access","token_type":"bearer"}'))
      .mockResolvedValueOnce(new Response('{"id":1376016924429759243,"kakao_account":{"email":"ignored@example.test"}}'));
    const provider = kakaoProvider(env,transport);
    const url = new URL(provider.authorize('random-state',true));
    expect(url.origin).toBe('https://kauth.kakao.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.test/v1/auth/kakao/callback');
    expect(url.searchParams.has('scope')).toBe(false);
    expect(url.searchParams.get('prompt')).toBe('login');
    expect(url.toString()).not.toContain('test-client-secret');
    expect(await provider.exchange('test-code','random-state')).toBe('1376016924429759243');
    expect(transport).toHaveBeenCalledTimes(2);
    const [tokenUrl,options] = transport.mock.calls[0]!;
    expect(tokenUrl).toBe('https://kauth.kakao.com/oauth/token');
    expect(options?.redirect).toBe('error');
    const body = options?.body as URLSearchParams;
    expect(body.get('client_secret')).toBe('test-client-secret');
    expect(body.get('code')).toBe('test-code');
    expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(url.searchParams.get('code_challenge'));
    const [profileUrl,profileOptions] = transport.mock.calls[1]!;
    expect(profileUrl).toBe('https://kapi.kakao.com/v2/user/me');
    expect(profileOptions?.headers).toEqual({Authorization:'Bearer test-access'});
  });
  it('accepts email-less profiles and never rounds an ID', async () => {
    for (const id of ['1','9223372036854775807']) {
      const transport = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('{"access_token":"test","token_type":"bearer"}'))
        .mockResolvedValueOnce(new Response(`{"id":${id}}`));
      expect(await kakaoProvider(env,transport).exchange('code','state')).toBe(id);
    }
  });
  it('rejects missing, fractional, exponential, negative and oversized provider IDs', async () => {
    for (const payload of ['{}','{"id":1.5}','{"id":1e3}','{"id":-1}','{"id":9223372036854775808}']) {
      const transport = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('{"access_token":"test","token_type":"bearer"}'))
        .mockResolvedValueOnce(new Response(payload));
      await expect(kakaoProvider(env,transport).exchange('code','state')).rejects.toThrow('TEMPORARILY_UNAVAILABLE');
    }
  });
  it('fails closed without credentials and sanitizes provider errors/timeouts', async () => {
    expect(()=>kakaoProvider({...env,KAKAO_CLIENT_SECRET:''})).toThrow('TEMPORARILY_UNAVAILABLE');
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('private-provider-detail',{status:400}));
    await expect(kakaoProvider(env,transport).exchange('code','state')).rejects.toThrow('TEMPORARILY_UNAVAILABLE');
    transport.mockRejectedValue(new Error('secret timeout detail'));
    await expect(kakaoProvider(env,transport).exchange('code','state')).rejects.toThrow('TEMPORARILY_UNAVAILABLE');
  });
  it('rejects cross-site starts/open redirects and requires configured Kakao credentials', async () => {
    for(const [key,value] of Object.entries(env)) vi.stubEnv(key,value);
    vi.stubEnv('KAKAO_CLIENT_SECRET',''); vi.stubEnv('VERCEL','');
    const app=createApp({ready:async()=>{},habits:async()=>[]});
    try {
      expect((await app.inject('/v1/auth/kakao/start?returnTo=https%3A%2F%2Fattacker.test')).statusCode).toBe(400);
      expect((await app.inject({url:'/v1/auth/kakao/start',headers:{'sec-fetch-site':'cross-site'}})).statusCode).toBe(403);
      expect((await app.inject('/v1/auth/kakao/start')).statusCode).toBe(503);
      const response = await app.inject('/v1/auth/kakao/callback?state=bad&error=secret-error&error_description=private-description');
      expect(response.statusCode).toBe(302); expect(response.headers.location).not.toContain('private-description');
      expect(response.headers.location).not.toContain('secret-error');
      expect(response.headers['set-cookie']).toBeUndefined();
    } finally { await app.close();vi.unstubAllEnvs(); }
  });
});
