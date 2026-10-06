import { describe, it, expect } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { inTransaction, runtimeConnectionString } from './database.js';

describe('runtime connection boundary', () => {
  it('never falls back to an integration or migration owner connection', () => {
    expect(() => runtimeConnectionString({DATABASE_URL:'postgresql://owner:secret@localhost/app',DIRECT_DATABASE_URL:'postgresql://owner:secret@localhost/app'})).toThrow('APP_DATABASE_NOT_CONFIGURED');
  });
  it.each(['postgresql://owner:secret@localhost/app','https://sixtysix_runtime:secret@localhost/app',
    'postgresql://sixtysix_runtime:secret@localhost/app?user=owner','postgresql://sixtysix_runtime:secret@localhost/app?options=-crole%3Downer'])('rejects an owner or overriding URL', url => {
    expect(() => runtimeConnectionString({APP_DATABASE_URL:url})).toThrow('INVALID_APP_DATABASE_URL');
  });
  it('accepts an explicit runtime role and Neon TLS options', () => {
    const url='postgresql://sixtysix_runtime_preview:secret@local-pooler.example/app?sslmode=require&channel_binding=require';
    expect(runtimeConnectionString({APP_DATABASE_URL:url})).toBe(url);
  });
});

describe('transaction connection ownership', () => {
  it.each([false, true])('commits or rolls back and releases the same client (failure=%s)', async fail => {
    const calls: string[] = [];
    let released = false;
    const client = { query: async (sql: string) => { calls.push(sql); },
      release: () => { released = true; } } as unknown as PoolClient;
    const source = { connect: async () => client } as Pick<Pool, 'connect'>;
    const promise = inTransaction(source, async connection => {
      expect(connection).toBe(client);
      await connection.query('SELECT 1');
      if (fail) throw new Error('application failure');
      return 42;
    });
    if (fail) await expect(promise).rejects.toThrow('application failure');
    else expect(await promise).toBe(42);
    expect(calls).toEqual(['BEGIN', 'SELECT 1', fail ? 'ROLLBACK' : 'COMMIT']);
    expect(released).toBe(true);
  });
});
