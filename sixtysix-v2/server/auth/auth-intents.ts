import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from '../database.js';
import { digest, IdentityCore, IdentityError, type Provider } from './identity-core.js';
import { reserveLimits } from './rate-limiter.js';

export interface IntentRow {
  id: string; purpose: 'reauth' | 'link'; provider: Provider; target_subject: string | null;
  expires_at: Date; proof_id: string | null; link_intent_id: string | null;
}
export class AuthIntents {
  private readonly core: IdentityCore;
  constructor(private readonly pool: Pick<Pool, 'connect'>) { this.core = new IdentityCore(pool); }

  async beginReauth(token: string, identityId: string, binding: string) {
    const identity = await this.core.identityForReauth(token, identityId);
    await this.reserve(token);
    return this.insert(randomUUID(), 'reauth', identity.provider, identity.subject, token, binding);
  }
  async beginLink(token: string, provider: Provider, binding: string, email?: string) {
    const subject = provider === 'email' ? email?.trim().toLowerCase() : null;
    if (provider === 'email' && (!subject || subject.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))) throw new IdentityError('INVALID_CHALLENGE');
    const session = await this.core.session(token);
    if (!session.recentlyAuthenticated) throw new IdentityError('REAUTH_REQUIRED');
    await this.reserve(token);
    const link = await this.core.beginLink(token, provider);
    return this.insert(link.id, 'link', provider, subject ?? null, token, binding, link.expiresAt);
  }
  private async reserve(token: string) {
    // Reserve before creating either intent row so rejected requests cannot leave
    // unbounded orphan link_intents behind the rate limit.
    await inTransaction(this.pool, client => reserveLimits(client, token,
      [{ scope: 'intents:session', value: 'create', count: 20, seconds: 600 }]));
  }
  private async insert(id: string, purpose: 'reauth' | 'link', provider: Provider, subject: string | null,
    token: string, binding: string, expiry?: Date): Promise<IntentRow> {
    return inTransaction(this.pool, async client => {
      const result = await client.query(`INSERT INTO sixtysix.auth_intents
        (id,purpose,provider,target_subject,browser_binding_hash,session_binding_hash,link_intent_id,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()+interval '5 minutes')) RETURNING *`,
      [id,purpose,provider,subject,digest(binding),digest(token),purpose === 'link' ? id : null,expiry ?? null]);
      return result.rows[0];
    });
  }
  async load(id: string, token: string | undefined, binding: string): Promise<IntentRow> {
    if (!token) throw new IdentityError('UNAUTHENTICATED');
    const session = await this.core.session(token);
    const row = await inTransaction(this.pool, async client => {
      const result = await client.query(`SELECT * FROM sixtysix.auth_intents WHERE id=$1
        AND session_binding_hash=$2 AND browser_binding_hash=$3 AND completed_at IS NULL
        AND expires_at>clock_timestamp()`, [id,digest(token),digest(binding)]);
      return result.rows[0] as IntentRow | undefined;
    });
    if (!row) throw new IdentityError('INVALID_CHALLENGE');
    if (row.purpose === 'link' && !session.recentlyAuthenticated) throw new IdentityError('REAUTH_REQUIRED');
    return row;
  }
  async verified(id: string, provider: Provider, subject: string, token: string | undefined, binding: string) {
    const intent = await this.load(id, token, binding);
    if (intent.provider !== provider || intent.proof_id || (intent.target_subject && intent.target_subject !== subject)) throw new IdentityError('FORBIDDEN');
    const proofId = await this.core.recordVerifiedProof({ provider,subject,browserBinding:binding,sessionToken:token!,
      ...(intent.purpose === 'link' ? { purpose: 'link' as const, intentId: id } : { purpose: 'reauth' as const }) });
    const saved = await inTransaction(this.pool, client => client.query(`UPDATE sixtysix.auth_intents SET proof_id=$2
      WHERE id=$1 AND proof_id IS NULL AND completed_at IS NULL AND expires_at>clock_timestamp() RETURNING id`, [id,proofId]));
    if (!saved.rowCount) throw new IdentityError('INVALID_CHALLENGE');
    if (intent.purpose === 'reauth') {
      await this.core.reauthenticate(token!, proofId, binding);
      await inTransaction(this.pool, client => client.query('UPDATE sixtysix.auth_intents SET completed_at=clock_timestamp() WHERE id=$1', [id]));
    }
    return { purpose: intent.purpose, nextAction: intent.purpose === 'link' ? 'COMPLETE_LINK' : 'REAUTHENTICATED', intentId: id };
  }
  async complete(token: string, id: string, binding: string) {
    const intent = await this.load(id, token, binding);
    if (intent.purpose !== 'link' || !intent.proof_id) throw new IdentityError('INVALID_CHALLENGE');
    await this.core.completeLink(token, id, intent.proof_id, binding);
    await inTransaction(this.pool, client => client.query('UPDATE sixtysix.auth_intents SET completed_at=clock_timestamp() WHERE id=$1', [id]));
    return this.core.identities(token);
  }
}
