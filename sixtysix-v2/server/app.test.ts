import { describe, it, expect, vi } from 'vitest';
import { createApp, type DatabaseReader } from './app.js';
import { normalizeApiUrl } from './vercel-handler.js';

const fixture = { id: '10000000-0000-4000-8000-000000000001', name: '읽기', shortName: '읽기',
  goal: '15분', imageRef: '/sample.webp', timeOfDay: 'morning' as const };
const db: DatabaseReader = { ready: async () => {}, habits: async () => [fixture] };

describe('Vercel API foundation', () => {
  it('serves an anonymous auth context only with valid server configuration', async () => {
    const app = createApp(db);
    try {
      vi.stubEnv('AUTH_CONTEXT_SECRET', '');
      expect((await app.inject('/v1/auth/context')).statusCode).toBe(503);
      vi.stubEnv('AUTH_CONTEXT_SECRET', 'test-only-0123456789abcdef0123456789abcdef');
      vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
      const response = await app.inject('/v1/auth/context');
      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json())).toEqual(['csrfToken']);
      expect(response.headers['set-cookie']).toContain('HttpOnly');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { vi.unstubAllEnvs(); await app.close(); }
  });
  it('separates liveness from database readiness', async () => {
    const app = createApp({ ...db, ready: async () => { throw new Error('postgres://secret'); } });
    try {
      expect((await app.inject('/v1/health')).statusCode).toBe(200);
      const failed = await app.inject('/v1/ready');
      expect(failed.statusCode).toBe(503);
      expect(failed.json().error.code).toBe('TEMPORARILY_UNAVAILABLE');
      expect(failed.body).not.toContain('secret');
      expect(failed.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });
  it('returns public catalog fields only and rejects unknown query input', async () => {
    const app = createApp({ ...db, habits: async () => [{ ...fixture, secret: 'do-not-expose' }] });
    try {
      const response = await app.inject('/v1/habits');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [fixture] });
      expect((await app.inject('/v1/habits?userId=forged')).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it('returns JSON 404 for unimplemented APIs instead of the SPA', async () => {
    const app = createApp(db);
    try {
      const response = await app.inject('/v1/unimplemented');
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    } finally { await app.close(); }
  });
  it('preserves API paths and query strings through direct/rewritten entrypoints', () => {
    expect(normalizeApiUrl('/api/backend?__route=habits&limit=1')).toBe('/v1/habits?limit=1');
    expect(normalizeApiUrl('/api/backend?limit=1', 'cohorts/123/feed')).toBe('/v1/cohorts/123/feed?limit=1');
    expect(normalizeApiUrl('/v1/habits?limit=1')).toBe('/v1/habits?limit=1');
    expect(normalizeApiUrl('/api/unknown')).toBe('/api/unknown');
  });
});
