import { createHash, createHmac } from 'node:crypto';
import { contextConfig } from './browser-context.js';

export class KakaoError extends Error {
  constructor(readonly code: 'INVALID_OAUTH_STATE' | 'TEMPORARILY_UNAVAILABLE' | 'FORBIDDEN') { super(code); }
}
export interface KakaoProvider {
  authorize(state: string, reauthenticate: boolean): string;
  exchange(code: string, state: string): Promise<string>;
}
export function kakaoProvider(env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): KakaoProvider {
  const { origin } = contextConfig(env);
  const clientId = env.KAKAO_CLIENT_ID;
  const secret = env.KAKAO_CLIENT_SECRET;
  if (!clientId || !secret) throw new KakaoError('TEMPORARILY_UNAVAILABLE');
  const redirect = `${origin}/v1/auth/kakao/callback`;
  // Recover the per-state PKCE verifier without persisting a raw OAuth credential.
  const verifier = (state: string) => createHmac('sha256', secret).update(`kakao-pkce:${state}`).digest('base64url');
  return {
    authorize(state, reauthenticate) {
      const url = new URL('https://kauth.kakao.com/oauth/authorize');
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect,
        state, scope: 'profile_nickname', code_challenge: createHash('sha256').update(verifier(state)).digest('base64url'),
        code_challenge_method: 'S256', ...(reauthenticate ? { prompt: 'login' } : {}) }).toString();
      return url.toString();
    },
    async exchange(code, state) {
      try {
        const tokenResponse = await transport('https://kauth.kakao.com/oauth/token', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          body: new URLSearchParams({ grant_type: 'authorization_code',client_id:clientId,client_secret:secret,
            redirect_uri:redirect,code,code_verifier:verifier(state) }),
        });
        if (!tokenResponse.ok) throw new Error('PROVIDER_FAILURE');
        const token = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown };
        if (typeof token.access_token !== 'string' || !token.access_token || token.token_type?.toString().toLowerCase() !== 'bearer') throw new Error('PROVIDER_FAILURE');
        const profile = await transport('https://kapi.kakao.com/v2/user/me', {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!profile.ok) throw new Error('PROVIDER_FAILURE');
        // Kakao IDs are 64-bit JSON integers. Node 22's source context preserves
        // digits above Number.MAX_SAFE_INTEGER instead of rounding ownership IDs.
        const user = JSON.parse(await profile.text(), (key: string, value: unknown, context?: { source: string }) =>
          key === 'id' && typeof value === 'number' ? context?.source : value) as { id?: unknown };
        if (typeof user.id !== 'string' || !/^[1-9]\d{0,18}$/.test(user.id) || BigInt(user.id) > 9223372036854775807n) throw new Error('PROVIDER_FAILURE');
        return user.id; // Deliberately discard reference email, nickname and tokens.
      } catch { throw new KakaoError('TEMPORARILY_UNAVAILABLE'); }
    },
  };
}
