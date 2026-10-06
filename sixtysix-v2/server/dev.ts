import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
await app.listen({ port, host: '127.0.0.1' });
console.log(`SIXTYSIX API: http://127.0.0.1:${port}/v1/health`);
