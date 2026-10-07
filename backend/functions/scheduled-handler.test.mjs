import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledHandler } from './scheduled-handler.mjs';

const result = { status: { outbox: { failed: 0 } }, budgetExhausted: false };
const request = (overrides = {}) => new Request('https://worker.example/', { method: 'POST',
  headers: { 'x-neon-trigger-invocation-id': 'run-1', 'content-type': 'application/json' },
  body: JSON.stringify({ version: 1, invocation_id: 'run-1', trigger: { type: 'schedule' },
    data: { scheduled_at: '2026-10-07T00:00:00Z' } }), ...overrides });

test('rejects public calls before touching DB', async () => {
  let calls = 0; const handler = createScheduledHandler({ runTick: async () => { calls++; } });
  assert.equal((await handler(request({ headers: {} }))).status, 403);
  assert.equal((await handler(new Request('https://worker.example/'))).status, 405);
  assert.equal((await handler(new Request('https://worker.example/other'))).status, 404);
  assert.equal(calls, 0);
});
test('rejects malformed and non-schedule envelopes', async () => {
  let calls = 0; const handler = createScheduledHandler({ runTick: async () => { calls++; } });
  for (const body of ['{', '{}', JSON.stringify({ version: 1, invocation_id: 'other', trigger: { type: 'schedule' }, data: { scheduled_at: '2026-10-07T00:00:00Z' } }),
    JSON.stringify({ version: 1, invocation_id: 'run-1', trigger: { type: 'schedule' }, data: { scheduled_at: 'invalid' } })]) {
    assert.equal((await handler(request({ body }))).status, 400);
  }
  assert.equal(calls, 0);
});
test('executes a scheduled tick and records measurable delay', async () => {
  const logs = []; let calls = 0;
  const handler = createScheduledHandler({ runTick: async () => { calls++; return result; },
    log: line => logs.push(JSON.parse(line)), now: () => Date.parse('2026-10-07T00:00:10Z') });
  const response = await handler(request());
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(logs[0].delayMs, 10000);
});
test('fails visibly for failed jobs or exhausted budget', async () => {
  for (const value of [{ ...result, budgetExhausted: true }, { ...result, status: { outbox: { failed: 1 } } }]) {
    const handler = createScheduledHandler({ runTick: async () => value, log: () => {} });
    assert.equal((await handler(request())).status, 503);
  }
});
test('redacts errors and permits recovery', async () => {
  const logs = []; let calls = 0;
  const handler = createScheduledHandler({ runTick: async () => { if (!calls++) throw Error('secret-connection-string'); return result; }, log: line => logs.push(line) });
  const response = await handler(request());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret/);
  assert.doesNotMatch(logs.join('\n'), /secret-connection-string/);
  assert.equal((await handler(request())).status, 200);
});
test('overlapping calls retry without sharing the DB client', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const handler = createScheduledHandler({ runTick: async () => { calls++; await pending; return result; }, log: () => {} });
  const first = handler(request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await handler(request())).status, 503); assert.equal(calls, 1);
  release(); assert.equal((await first).status, 200);
  assert.equal((await handler(request())).status, 200);
});
