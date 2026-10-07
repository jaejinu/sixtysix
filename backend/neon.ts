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
      cron: '2-57/5 * * * *',
      // Enable only after checking public-call rejection on the deployed edge.
      enabled: false,
    },
  },
});
