import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from '../database.js';
import { authAudit, auditedAuthAttempt } from './audit.js';

export type Provider = 'email' | 'kakao';
type Purpose = 'login' | 'reauth' | 'link';
export class IdentityError extends Error {
  constructor(readonly code: 'INVALID_CHALLENGE' | 'UNAUTHENTICATED' | 'REAUTH_REQUIRED' |
    'IDENTITY_ALREADY_LINKED' | 'LAST_IDENTITY' | 'NOT_FOUND' | 'FORBIDDEN') { super(code); }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (code: IdentityError['code']): never => { throw new IdentityError(code); };

function subjectOf(provider: Provider, subject: string) {
  if (provider === 'kakao') {
    if (!/^[1-9]\d{0,39}$/.test(subject)) return fail('INVALID_CHALLENGE');
    return subject;
  }
  if (provider !== 'email') return fail('INVALID_CHALLENGE');
  const email = subject.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('INVALID_CHALLENGE');
  return email;
}
function tokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail('UNAUTHENTICATED');
  return digest(token);
}
interface Session { user_id: string; token_hash: string; fresh: boolean }
export async function requireAccountSession(client: PoolClient, token: string): Promise<Session> {
    const hash = tokenHash(token);
    // All account mutations lock the user first. Recheck session after acquiring it:
    // a concurrent logout/unlink may have committed while this request waited.
    const user = await client.query(`SELECT u.id FROM sixtysix.app_users u
      JOIN sixtysix.auth_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 FOR UPDATE OF u`, [hash]);
    if (!user.rowCount) return fail('UNAUTHENTICATED');
    const { rows } = await client.query(`SELECT s.user_id, s.token_hash,
      s.reauthenticated_at > clock_timestamp() - interval '5 minutes' AS fresh
      FROM sixtysix.auth_sessions s JOIN sixtysix.app_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
      AND u.suspended_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL`, [hash]);
    return rows[0] ?? fail('UNAUTHENTICATED');
  }


class RetryLogin extends Error {}

/** No HTTP handler accepts a provider subject as proof. Call recordVerifiedProof ONLY
 * after successful server-side OTP/OAuth verification and purpose/binding checks.
 * This module deliberately does not export a public sign-in-by-email endpoint. */
export class IdentityCore {
  constructor(private readonly pool: Pick<Pool, 'connect'>) {}

  async recordVerifiedProof(input: {
    provider: Provider; subject: string; browserBinding: string;
  } & ({ purpose: 'login' } | { purpose: 'reauth'; sessionToken: string } |
       { purpose: 'link'; sessionToken: string; intentId: string })) {
    const subject = subjectOf(input.provider, input.subject);
    if (input.browserBinding.length < 32) return fail('INVALID_CHALLENGE');
    return inTransaction(this.pool, async client => {
      let session: Session | undefined;
      if (input.purpose !== 'login') session = await this.requireSession(client, input.sessionToken);
      if (input.purpose === 'link') {
        if (!session!.fresh) return fail('REAUTH_REQUIRED');
        await this.intent(client, input.intentId, session!, input.provider);
      }
      const { rows } = await client.query(`INSERT INTO sixtysix.auth_proofs
        (provider, subject, purpose, browser_binding_hash, session_binding_hash, link_intent_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [input.provider, subject, input.purpose,
        digest(input.browserBinding), session?.token_hash ?? null, input.purpose === 'link' ? input.intentId : null]);
      return rows[0].id as string;
    });
  }

  private requireSession(client: PoolClient, token: string) {
    return requireAccountSession(client, token);
  }

  private async proof(client: PoolClient, id: string, binding: string, purpose: Purpose,
    sessionHash: string | null = null, intentId: string | null = null) {
    const { rows } = await client.query(`UPDATE sixtysix.auth_proofs SET consumed_at=clock_timestamp()
      WHERE id=$1 AND browser_binding_hash=$2 AND purpose=$3
      AND session_binding_hash IS NOT DISTINCT FROM $4::text
      AND link_intent_id IS NOT DISTINCT FROM $5::uuid
      AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING provider, subject`,
    [id, digest(binding), purpose, sessionHash, intentId]);
    return rows[0] as { provider: Provider; subject: string } | undefined ?? fail('INVALID_CHALLENGE');
  }

  private async identityLock(client: PoolClient, provider: Provider, subject: string) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 666602))', [`${provider}:${subject}`]);
  }

  async login(proofId: string, browserBinding: string) {
    return auditedAuthAttempt(this.pool, 'auth.login.rejected', async () => {
    try { return await this.loginAttempt(proofId, browserBinding); }
    catch (error) {
      // Another first login/link created ownership while waiting for the identity lock.
      // Roll back the proof consumption and retry with user -> identity lock order.
      if (error instanceof RetryLogin) return this.loginAttempt(proofId, browserBinding);
      throw error;
    }
    });
  }

  private async loginAttempt(proofId: string, browserBinding: string) {
    return inTransaction(this.pool, async client => {
      const proof = await this.proof(client, proofId, browserBinding, 'login');
      // Serialize first creation without taking this lock before an existing user lock.
      // Link/unlink acquire user -> identity. Existing-login follows the same order.
      let found = await client.query('SELECT user_id FROM sixtysix.auth_identities WHERE provider=$1 AND subject=$2',
        [proof.provider, proof.subject]);
      const lockedUserId = found.rows[0]?.user_id;
      if (found.rowCount) {
        await client.query('SELECT id FROM sixtysix.app_users WHERE id=$1 FOR UPDATE', [found.rows[0].user_id]);
      }
      await this.identityLock(client, proof.provider, proof.subject);
      found = await client.query(`SELECT i.user_id, i.disabled_at, u.suspended_at, u.deletion_requested_at, u.anonymized_at
        FROM sixtysix.auth_identities i JOIN sixtysix.app_users u ON u.id=i.user_id
        WHERE i.provider=$1 AND i.subject=$2`, [proof.provider, proof.subject]);
      let userId: string;
      if (found.rowCount) {
        const row = found.rows[0];
        if (row.user_id !== lockedUserId) throw new RetryLogin();
        if (row.disabled_at || row.suspended_at || row.deletion_requested_at || row.anonymized_at) return fail('FORBIDDEN');
        userId = row.user_id;
      } else {
        userId = randomUUID();
        // auth_subject is an internal opaque account key, never an email or provider ID.
        await client.query("INSERT INTO sixtysix.app_users(id,auth_subject,display_name) VALUES ($1::uuid,$1::uuid::text,'새 멤버')", [userId]);
        await client.query('INSERT INTO sixtysix.preferences(user_id) VALUES ($1)', [userId]);
        await client.query('INSERT INTO sixtysix.auth_identities(user_id,provider,subject) VALUES ($1,$2,$3)',
          [userId, proof.provider, proof.subject]);
      }
      const token = randomBytes(32).toString('base64url');
      const result = await client.query(`INSERT INTO sixtysix.auth_sessions(token_hash,user_id,expires_at)
        VALUES ($1,$2,clock_timestamp()+interval '7 days') RETURNING expires_at`, [digest(token), userId]);
      await authAudit(client, `auth.login.${proof.provider}`, userId);
      return { userId, token, expiresAt: result.rows[0].expires_at as Date };
    });
  }

  async session(token: string) {
    return inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      return { userId: session.user_id, recentlyAuthenticated: session.fresh };
    });
  }

  async identityForReauth(token: string, identityId: string) {
    return inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      const result = await client.query(`SELECT provider,subject FROM sixtysix.auth_identities
        WHERE id=$1 AND user_id=$2 AND disabled_at IS NULL`, [identityId, session.user_id]);
      return result.rows[0] as { provider: Provider; subject: string } | undefined ?? fail('NOT_FOUND');
    });
  }

  async identities(token: string) {
    return inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      const result = await client.query(`SELECT id,provider,subject FROM sixtysix.auth_identities
        WHERE user_id=$1 AND disabled_at IS NULL ORDER BY created_at,id`, [session.user_id]);
      return result.rows.map(row => ({ id: row.id as string, provider: row.provider as Provider,
        label: row.provider === 'email' ? `${row.subject[0]}***@${row.subject.split('@')[1]}` : '카카오', usable: true }));
    });
  }

  async me(token: string) {
    return inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      const user = await client.query(`SELECT u.id,u.display_name,p.default_visibility FROM sixtysix.app_users u
        JOIN sixtysix.preferences p ON p.user_id=u.id WHERE u.id=$1`, [session.user_id]);
      if (!user.rows[0]) return fail('UNAUTHENTICATED');
      const identities = await client.query(`SELECT id,provider,subject FROM sixtysix.auth_identities
        WHERE user_id=$1 AND disabled_at IS NULL ORDER BY created_at,id`, [session.user_id]);
      const memberships = await client.query(`SELECT id,cohort_id AS "cohortId",joined_at AS "joinedAt",
        cancelled_at AS "cancelledAt",left_at AS "leftAt" FROM sixtysix.memberships WHERE user_id=$1 ORDER BY joined_at,id`, [session.user_id]);
      const slot = await client.query('SELECT membership_id FROM sixtysix.user_cohort_slots WHERE user_id=$1', [session.user_id]);
      return { profile:{id:user.rows[0].id as string,displayName:user.rows[0].display_name as string},
        preferences:{defaultVisibility:user.rows[0].default_visibility as 'cohort'|'private'},
        identities:identities.rows.map(row=>({id:row.id as string,provider:row.provider as Provider,
          label:row.provider==='email' ? `${row.subject[0]}***@${row.subject.split('@')[1]}` : '카카오',usable:true})),
        memberships:memberships.rows.map(row=>({id:row.id as string,cohortId:row.cohortId as string,
          joinedAt:(row.joinedAt as Date).toISOString(),cancelledAt:(row.cancelledAt as Date|null)?.toISOString() ?? null,
          leftAt:(row.leftAt as Date|null)?.toISOString() ?? null})),
        currentMembershipId:(slot.rows[0]?.membership_id ?? null) as string|null };
    });
  }

  async reauthenticate(token: string, proofId: string, browserBinding: string) {
    return auditedAuthAttempt(this.pool, 'auth.reauthenticate.rejected', () => inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      const proof = await this.proof(client, proofId, browserBinding, 'reauth', session.token_hash);
      const identity = await client.query(`SELECT id FROM sixtysix.auth_identities
        WHERE user_id=$1 AND provider=$2 AND subject=$3 AND disabled_at IS NULL`,
      [session.user_id, proof.provider, proof.subject]);
      if (!identity.rowCount) return fail('FORBIDDEN');
      await client.query('UPDATE sixtysix.auth_sessions SET reauthenticated_at=clock_timestamp() WHERE token_hash=$1', [session.token_hash]);
      await authAudit(client, `auth.reauthenticate.${proof.provider}`, session.user_id);
    }));
  }

  async beginLink(token: string, provider: Provider) {
    if (!['email', 'kakao'].includes(provider)) return fail('INVALID_CHALLENGE');
    return inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      if (!session.fresh) return fail('REAUTH_REQUIRED');
      const { rows } = await client.query(`INSERT INTO sixtysix.link_intents(user_id,session_binding_hash,provider,expires_at)
        VALUES ($1,$2,$3,clock_timestamp()+interval '5 minutes') RETURNING id, expires_at`, [session.user_id, session.token_hash, provider]);
      return { id: rows[0].id as string, expiresAt: rows[0].expires_at as Date };
    });
  }

  private async intent(client: PoolClient, id: string, session: Session, provider?: Provider) {
    const { rows } = await client.query(`SELECT provider FROM sixtysix.link_intents WHERE id=$1 AND user_id=$2
      AND session_binding_hash=$3 AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE`,
    [id, session.user_id, session.token_hash]);
    if (!rows[0] || (provider && provider !== rows[0].provider)) return fail('INVALID_CHALLENGE');
    return rows[0].provider as Provider;
  }

  async completeLink(token: string, intentId: string, proofId: string, browserBinding: string) {
    return auditedAuthAttempt(this.pool, 'auth.identity.link.rejected', () => inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      if (!session.fresh) return fail('REAUTH_REQUIRED');
      const provider = await this.intent(client, intentId, session);
      const proof = await this.proof(client, proofId, browserBinding, 'link', session.token_hash, intentId);
      if (provider !== proof.provider) return fail('INVALID_CHALLENGE');
      await this.identityLock(client, proof.provider, proof.subject);
      const found = await client.query('SELECT user_id FROM sixtysix.auth_identities WHERE provider=$1 AND subject=$2',
        [proof.provider, proof.subject]);
      // Disabled identities keep ownership; unlinking never releases them to another account.
      if (found.rowCount && found.rows[0].user_id !== session.user_id) return fail('IDENTITY_ALREADY_LINKED');
      const result = await client.query(`INSERT INTO sixtysix.auth_identities(user_id,provider,subject) VALUES ($1,$2,$3)
        ON CONFLICT(provider,subject) DO UPDATE SET disabled_at=NULL RETURNING id`,
      [session.user_id, proof.provider, proof.subject]);
      await client.query(`UPDATE sixtysix.link_intents SET verified_provider_subject=$2,
        verified_at=clock_timestamp(), consumed_at=clock_timestamp() WHERE id=$1`, [intentId, proof.subject]);
      await authAudit(client, `auth.identity.link.${provider}`, session.user_id, result.rows[0].id);
      return { id: result.rows[0].id as string, provider };
    }));
  }

  async unlink(token: string, identityId: string) {
    return auditedAuthAttempt(this.pool, 'auth.identity.unlink.rejected', () => inTransaction(this.pool, async client => {
      const session = await this.requireSession(client, token);
      if (!session.fresh) return fail('REAUTH_REQUIRED');
      const identities = await client.query('SELECT id,provider,subject FROM sixtysix.auth_identities WHERE user_id=$1 AND disabled_at IS NULL', [session.user_id]);
      const identity = identities.rows.find(row => row.id === identityId);
      if (!identity) return fail('NOT_FOUND');
      if (identities.rows.length <= 1) return fail('LAST_IDENTITY');
      await this.identityLock(client, identity.provider, identity.subject);
      await client.query('UPDATE sixtysix.auth_identities SET disabled_at=clock_timestamp() WHERE id=$1', [identityId]);
      // Removing a login method revokes other sessions, including those obtained with it.
      await client.query(`UPDATE sixtysix.auth_sessions SET revoked_at=clock_timestamp()
        WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`, [session.user_id, session.token_hash]);
      await authAudit(client, `auth.identity.unlink.${identity.provider as Provider}`, session.user_id, identityId);
    }));
  }

  async logout(token: string) {
    return inTransaction(this.pool, async client => {
      const hash = tokenHash(token);
      await client.query(`SELECT u.id FROM sixtysix.app_users u JOIN sixtysix.auth_sessions s ON s.user_id=u.id
        WHERE s.token_hash=$1 FOR UPDATE OF u`, [hash]);
      const changed = await client.query('UPDATE sixtysix.auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id', [hash]);
      if (changed.rows[0]) await authAudit(client, 'auth.logout', changed.rows[0].user_id);
    });
  }
}
