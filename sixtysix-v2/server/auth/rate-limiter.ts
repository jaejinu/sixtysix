import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { EmailAuthError } from './auth-errors.js';
interface Limit { scope: string; value: string; count: number; seconds: number }
export async function reserveLimits(client: PoolClient, secret: string, limits: Limit[]) {
  // Same sorted lock order across instances; all counters live in PostgreSQL.
  const buckets = limits.map(item => ({ ...item, key: createHmac('sha256', secret).update(`rate:${item.scope}:${item.value}`).digest('hex') }))
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const bucket of buckets) {
    const result = await client.query(`INSERT INTO sixtysix.auth_rate_limits(bucket_key,hits,expires_at)
      VALUES ($1,1,clock_timestamp()+$2*interval '1 second')
      ON CONFLICT(bucket_key) DO UPDATE SET
        hits=CASE WHEN auth_rate_limits.expires_at<=clock_timestamp() THEN 1 ELSE auth_rate_limits.hits+1 END,
        expires_at=CASE WHEN auth_rate_limits.expires_at<=clock_timestamp()
          THEN clock_timestamp()+$2*interval '1 second' ELSE auth_rate_limits.expires_at END
      WHERE auth_rate_limits.expires_at<=clock_timestamp() OR auth_rate_limits.hits<$3
      RETURNING hits`, [bucket.key, bucket.seconds, bucket.count]);
    if (!result.rowCount) {
      const retry = await client.query(`SELECT GREATEST(1,ceil(extract(epoch FROM expires_at-clock_timestamp())))::int AS seconds
        FROM sixtysix.auth_rate_limits WHERE bucket_key=$1`, [bucket.key]);
      throw new EmailAuthError('RATE_LIMITED', retry.rows[0].seconds);
    }
  }
}
