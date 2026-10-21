import { defineConfig } from '@neon/config/v1';

const workerUrl = process.env.WORKER_DATABASE_URL;
if (!workerUrl) throw new Error('WORKER_DATABASE_URL_REQUIRED');

export default defineConfig({
  functions: {
    sixtysixworker: {
      name: 'SIXTYSIX Preview scheduled worker',
      source: './functions/scheduled-worker.mjs',
      env: { WORKER_DATABASE_URL: workerUrl },
    },
  },
  triggers: {
    'sixtysix-preview-tick': {
      type: 'schedule',
      function: 'sixtysixworker',
      cron: '2,17,32,47 * * * *',
      // Enabled 2026-10-22 after plain and forged-header calls returned 403 on the deployed edge.
      enabled: true,
    },
  },
});
