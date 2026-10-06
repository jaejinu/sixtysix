import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { inTransaction } from '../database.js';

export const authAuditContext = new AsyncLocalStorage<string>();
type Provider = 'email' | 'kakao';
type Action = `auth.login.${Provider}` | `auth.reauthenticate.${Provider}` |
  `auth.identity.link.${Provider}` | `auth.identity.unlink.${Provider}` | 'auth.logout' |
  'auth.login.rejected' | 'auth.reauthenticate.rejected' | 'auth.identity.link.rejected' |
  'auth.identity.unlink.rejected' | 'auth.email.sent' | 'auth.email.failed' |
  'auth.email.rejected' | 'auth.kakao.rejected';
const reasons = ['INVALID_CHALLENGE','INVALID_OAUTH_STATE','UNAUTHENTICATED','REAUTH_REQUIRED',
  'FORBIDDEN','IDENTITY_ALREADY_LINKED','LAST_IDENTITY','NOT_FOUND','TEMPORARILY_UNAVAILABLE'] as const;
type Reason = typeof reasons[number];
export function auditReason(error: unknown): Reason | undefined {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && reasons.includes(code as Reason) ? code as Reason : undefined;
}
export async function authAudit(client: PoolClient, action: Action,
  actorId: string | null = null, targetId: string | null = actorId, reason: Reason | null = null) {
  const context = authAuditContext.getStore();
  const requestId = context && /^[0-9a-f-]{36}$/i.test(context) ? context : randomUUID();
  await client.query(`INSERT INTO sixtysix.audit_events(actor_id,action,target_type,target_id,request_id,reason_code)
    VALUES ($1,$2,'auth',$3,$4,$5)`, [actorId,action,targetId,requestId,reason]);
}
// Rejection is recorded after the command's transaction has rolled back. Never
// infer an actor from a caller's email, identity ID or unverified session token.
export async function auditedAuthAttempt<T>(pool: Pick<Pool,'connect'>, action: Action, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    const reason = auditReason(error);
    // Random/expired cookies must not turn anonymous traffic into audit writes.
    if (reason && reason !== 'UNAUTHENTICATED') await inTransaction(pool, client => authAudit(client,action,null,null,reason));
    throw error;
  }
}
