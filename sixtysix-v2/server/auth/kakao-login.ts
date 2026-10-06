import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from '../database.js';
import { digest, IdentityCore } from './identity-core.js';
import { AuthIntents } from './auth-intents.js';
import { KakaoError, type KakaoProvider } from './kakao-provider.js';
import { reserveLimits } from './rate-limiter.js';
import { auditedAuthAttempt } from './audit.js';

export class KakaoLogin {
  private readonly intents: AuthIntents;
  private readonly core: IdentityCore;
  constructor(private readonly pool: Pick<Pool, 'connect'>, private readonly secret: string, private readonly provider: KakaoProvider) {
    if (secret.length < 32) throw new KakaoError('TEMPORARILY_UNAVAILABLE');
    this.intents = new AuthIntents(pool); this.core = new IdentityCore(pool);
  }
  async start(browser: { binding: string; ip: string }, returnTo = '/home', intentId?: string, token?: string, userAgent = '') {
    if (!['/home','/my','/onboarding'].includes(returnTo)) throw new KakaoError('FORBIDDEN');
    const intent = intentId ? await this.intents.load(intentId, token, browser.binding) : undefined;
    if (intent && (intent.provider !== 'kakao' || intent.proof_id)) throw new KakaoError('INVALID_OAUTH_STATE');
    // Kakao documents prompt=login as unsupported in its in-app browser.
    if (intent?.purpose === 'reauth' && /KAKAOTALK/i.test(userAgent)) throw new KakaoError('FORBIDDEN');
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = this.provider.authorize(state, intent?.purpose === 'reauth');
    await inTransaction(this.pool, async client => {
      await reserveLimits(client, this.secret, [
        { scope: 'oauth:browser', value: browser.binding, count: 20, seconds: 3600 },
        { scope: 'oauth:ip', value: browser.ip, count: 100, seconds: 3600 },
      ]);
      const result = await client.query(`INSERT INTO sixtysix.oauth_states(state_hash,browser_binding_hash,intent_id,return_to)
        VALUES ($1,$2,$3,$4) ON CONFLICT(intent_id) DO NOTHING RETURNING state_hash`,
      [digest(state),digest(browser.binding),intentId ?? null,intent ? '/my' : returnTo]);
      if (!result.rowCount) throw new KakaoError('INVALID_OAUTH_STATE');
    });
    return authorizationUrl;
  }
  async callback(input: { state: string; code?: string; error?: string }, binding: string, token?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.state) || Boolean(input.code) === Boolean(input.error)) throw new KakaoError('INVALID_OAUTH_STATE');
    // Claim before provider IO. Concurrent/replayed callbacks never exchange twice.
    const state = await inTransaction(this.pool, async client => {
      const result = await client.query(`UPDATE sixtysix.oauth_states SET consumed_at=clock_timestamp()
        WHERE state_hash=$1 AND browser_binding_hash=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()
        RETURNING intent_id,return_to`, [digest(input.state),digest(binding)]);
      return result.rows[0] as { intent_id: string | null; return_to: string } | undefined;
    });
    if (!state) throw new KakaoError('INVALID_OAUTH_STATE');
    return auditedAuthAttempt(this.pool, 'auth.kakao.rejected', async () => {
    if (input.error) throw new KakaoError('FORBIDDEN');
    if (state.intent_id) await this.intents.load(state.intent_id, token, binding);
    const subject = await this.provider.exchange(input.code!, input.state);
    if (state.intent_id) {
      const result = await this.intents.verified(state.intent_id, 'kakao', subject, token, binding);
      return { returnTo: `/my?auth=${result.nextAction}&intentId=${state.intent_id}` };
    }
    const proof = await this.core.recordVerifiedProof({ purpose:'login',provider:'kakao',subject,browserBinding:binding });
    return { returnTo: state.return_to === '/my' ? '/my?auth=SIGNED_IN' : state.return_to, session: await this.core.login(proof, binding) };
    });
  }
}
