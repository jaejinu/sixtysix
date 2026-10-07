// Only deploy behind Neon's Functions edge: it removes caller-supplied
// X-Neon-* headers. This is NOT authentication on other hosting platforms.
export function createScheduledHandler({ runTick, log = console.log, now = Date.now }) {
  let running = false;
  const reply = (status, code) => Response.json({ status: code }, { status, headers: { 'Cache-Control': 'no-store' } });
  return async function fetch(request) {
    if (new URL(request.url).pathname !== '/') return reply(404, 'NOT_FOUND');
    if (request.method !== 'POST') return reply(405, 'METHOD_NOT_ALLOWED');
    const invocation = request.headers.get('x-neon-trigger-invocation-id');
    if (!invocation) return reply(403, 'FORBIDDEN');
    let body;
    try { body = await request.json(); } catch { return reply(400, 'INVALID_TRIGGER'); }
    const scheduledAt = body?.data?.scheduled_at;
    if (body?.version !== 1 || body?.trigger?.type !== 'schedule' || body?.invocation_id !== invocation ||
        typeof scheduledAt !== 'string' || !Number.isFinite(Date.parse(scheduledAt))) return reply(400, 'INVALID_TRIGGER');
    if (running) return reply(503, 'BUSY');
    running = true;
    const startedAt = now();
    try {
      const result = await runTick();
      const failed = result.status.outbox.failed > 0 || result.budgetExhausted;
      log(JSON.stringify({ event: 'scheduled_worker', scheduledAt, startedAt: new Date(startedAt).toISOString(),
        delayMs: Math.max(0, startedAt - Date.parse(scheduledAt)), durationMs: now() - startedAt, ...result }));
      return reply(failed ? 503 : 200, failed ? 'WORK_REMAINS' : 'OK');
    } catch {
      // Never log exceptions: connection errors can contain credentials or SQL.
      log(JSON.stringify({ event: 'scheduled_worker', status: 'FAILED', scheduledAt, durationMs: now() - startedAt }));
      return reply(503, 'WORKER_FAILED');
    } finally { running = false; }
  };
}
