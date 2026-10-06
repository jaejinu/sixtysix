import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

const app = createApp();
const ready = app.ready();

export function normalizeApiUrl(url: string, rewrittenRoute?: string): string {
  const parsed = new URL(url, 'https://internal.invalid');
  const route = rewrittenRoute ?? parsed.searchParams.get('__route');
  parsed.searchParams.delete('__route');
  const pathname = parsed.pathname === '/api/backend' && route !== null && route !== undefined
    ? `/v1/${route}` : parsed.pathname;
  const search = parsed.searchParams.toString();
  return pathname + (search ? `?${search}` : '');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ready;
    const query = (req as IncomingMessage & { query?: Record<string, unknown> }).query;
    req.url = normalizeApiUrl(req.url ?? '/', typeof query?.__route === 'string' ? query.__route : undefined);
    app.server.emit('request', req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'TEMPORARILY_UNAVAILABLE',
      message: '잠시 후 다시 시도해주세요.', requestId: 'startup' } }));
  }
}
