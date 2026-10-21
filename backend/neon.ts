import { defineConfig } from '@neon/config/v1';

const workerUrl = process.env.WORKER_DATABASE_URL;
if (!workerUrl) throw new Error('WORKER_DATABASE_URL_REQUIRED');

// The target comes from the worker role (sixtysix_worker_preview / _production), so a
// Production env file can never deploy under Preview names or the other way round.
const target = /^sixtysix_worker_(preview|production)$/.exec(new URL(workerUrl).username)?.[1];
if (!target) throw new Error('WORKER_ROLE_TARGET_UNKNOWN');
const label = target === 'preview' ? 'Preview' : 'Production';

export default defineConfig({
  functions: {
    sixtysixworker: {
      name: `SIXTYSIX ${label} scheduled worker`,
      source: './functions/scheduled-worker.mjs',
      env: { WORKER_DATABASE_URL: workerUrl },
    },
  },
  triggers: {
    [`sixtysix-${target}-tick`]: {
      type: 'schedule',
      function: 'sixtysixworker',
      cron: '2,17,32,47 * * * *',
      // First deploy of a new branch runs with NEON_TRIGGER_ENABLED=false; enable only after
      // plain and forged-header calls return 403 on the deployed edge (v2/SCHEDULED-WORKER.md).
      enabled: process.env.NEON_TRIGGER_ENABLED !== 'false',
    },
  },
});
