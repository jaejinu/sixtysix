import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { EmailAuthError } from './auth-errors.js';
import { reserveLimits } from './rate-limiter.js';
import { inTransaction } from '../database.js';
import { authAudit } from './audit.js';
import { digest, IdentityCore, IdentityError } from './identity-core.js';
import { AuthIntents, type IntentRow } from './auth-intents.js';

export interface CodeMailer {
  send(input: { id: string; email: string; code: string }): Promise<void>;
}
export { EmailAuthError } from './auth-errors.js';
interface Browser { binding: string; ip: string }


export class EmailLogin {
  private readonly core: IdentityCore;
  constructor(private readonly pool: Pick<Pool, 'connect'>, private readonly secret: string,
    private readonly mailer: CodeMailer) {
    if (secret.length < 32) throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
    this.core = new IdentityCore(pool);
  }
  private mac(purpose: string, value: string) {
    return createHmac('sha256', this.secret).update(`${purpose}:${value}`).digest('hex');
  }
  async issue(emailInput: string, browser: Browser) {
    return this.issueFor(emailInput, browser);
  }
  async issueIntent(id: string, token: string, browser: Browser) {
    const intent = await new AuthIntents(this.pool).load(id, token, browser.binding);
    if (intent.provider !== 'email' || !intent.target_subject || intent.proof_id) throw new IdentityError('INVALID_CHALLENGE');
    return this.issueFor(intent.target_subject, browser, intent);
  }
  private async issueFor(emailInput: string, browser: Browser, intent?: IntentRow) {
    const email = emailInput.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || browser.binding.length < 32 || !browser.ip) {
      throw new IdentityError('INVALID_CHALLENGE');
    }
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = await inTransaction(this.pool, async client => {
      await reserveLimits(client, this.secret, [
        { scope: 'send:email:cooldown', value: email, count: 1, seconds: 60 },
        { scope: 'send:email', value: email, count: 5, seconds: 3600 },
        { scope: 'send:browser', value: browser.binding, count: 10, seconds: 3600 },
        { scope: 'send:ip', value: browser.ip, count: 30, seconds: 3600 },
      ]);
      const result = await client.query(`INSERT INTO sixtysix.email_challenges(id,email,browser_binding_hash,code_hash,purpose,intent_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING expires_at`, [id, email, digest(browser.binding), this.mac(`code:${id}`, code),intent?.purpose ?? 'login',intent?.id ?? null]);
      return result.rows[0].expires_at as Date;
    });
    try {
      // Never hold a database transaction/connection open during a network send.
      await this.mailer.send({ id, email, code });
    } catch {
      await inTransaction(this.pool, async client => {
        await client.query("UPDATE sixtysix.email_challenges SET delivery_state='failed' WHERE id=$1", [id]);
        await authAudit(client, 'auth.email.failed', null, id, 'TEMPORARILY_UNAVAILABLE');
      });
      throw new EmailAuthError('TEMPORARILY_UNAVAILABLE');
    }
    await inTransaction(this.pool, async client => {
      await client.query("UPDATE sixtysix.email_challenges SET delivery_state='sent' WHERE id=$1", [id]);
      await authAudit(client, 'auth.email.sent', null, id);
    });
    return { challengeId: id, expiresAt: expiresAt.toISOString(), message: '인증번호를 요청했습니다. 이메일을 확인해주세요.' };
  }
  async verify(challengeId: string, code: string, browser: Browser, token?: string) {
    // Count attempts even for unknown challenges. Commit before checking the code.
    await inTransaction(this.pool, client => reserveLimits(client, this.secret, [
      { scope: 'verify:browser', value: browser.binding, count: 30, seconds: 600 },
      { scope: 'verify:ip', value: browser.ip, count: 120, seconds: 600 },
    ]));
    const verified = await inTransaction(this.pool, async client => {
      const { rows } = await client.query(`SELECT email,code_hash,intent_id FROM sixtysix.email_challenges
        WHERE id=$1 AND browser_binding_hash=$2 AND delivery_state='sent'
        AND consumed_at IS NULL AND attempts<3 AND expires_at>clock_timestamp() FOR UPDATE`, [challengeId, digest(browser.binding)]);
      if (!rows[0]) return null;
      // Recheck expiry after a possible row-lock wait, using wall-clock time.
      const valid = await client.query(`SELECT id FROM sixtysix.email_challenges WHERE id=$1 AND expires_at>clock_timestamp()`, [challengeId]);
      if (!valid.rowCount) return null;
      if (rows[0].intent_id) {
        if (!token) return null;
        const intent = await client.query(`SELECT id FROM sixtysix.auth_intents WHERE id=$1 AND session_binding_hash=$2
          AND browser_binding_hash=$3 AND completed_at IS NULL AND proof_id IS NULL AND expires_at>clock_timestamp()`,
        [rows[0].intent_id,digest(token),digest(browser.binding)]);
        if (!intent.rowCount) return null;
      }
      if (!/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(rows[0].code_hash, 'hex'), Buffer.from(this.mac(`code:${challengeId}`, code), 'hex'))) {
        await client.query('UPDATE sixtysix.email_challenges SET attempts=attempts+1 WHERE id=$1', [challengeId]);
        await authAudit(client, 'auth.email.rejected', null, challengeId, 'INVALID_CHALLENGE');
        return null; // Returning (not throwing) commits the failed attempt.
      }
      await client.query('UPDATE sixtysix.email_challenges SET consumed_at=clock_timestamp() WHERE id=$1', [challengeId]);
      if (rows[0].intent_id) return { intentId: rows[0].intent_id as string, subject: rows[0].email as string };
      const proof = await client.query(`INSERT INTO sixtysix.auth_proofs(provider,subject,purpose,browser_binding_hash)
        VALUES ('email',$1,'login',$2) RETURNING id`, [rows[0].email, digest(browser.binding)]);
      return { proofId: proof.rows[0].id as string };
    });
    if (!verified) throw new IdentityError('INVALID_CHALLENGE');
    if (verified.intentId) return new AuthIntents(this.pool).verified(verified.intentId, 'email', verified.subject!, token, browser.binding);
    // Proof stays internal. If session creation fails, no proof is exposed; request
    // a new code. The consumed code cannot create a second session on retries.
    return { ...await this.core.login(verified.proofId!, browser.binding), purpose: 'login', nextAction: 'SIGNED_IN', intentId: null };
  }
}
