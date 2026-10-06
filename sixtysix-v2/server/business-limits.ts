import type { PoolClient } from 'pg';
import { reserveLimits } from './auth/rate-limiter.js';

// Shared across command types, sessions and server instances. The value is an
// authenticated opaque account UUID, never an IP, email or client-supplied ID.
// This public namespace is domain separation, not a credential/privacy secret.
export async function reserveBusinessLimits(client: PoolClient, userId: string, replay: boolean) {
  await reserveLimits(client, 'sixtysix-business-v1', replay
    ? [{ scope: 'business.replay.minute', value: userId, count: 60, seconds: 60 }]
    : [{ scope: 'business.command.minute', value: userId, count: 20, seconds: 60 },
       { scope: 'business.command.hour', value: userId, count: 120, seconds: 3600 }]);
}
