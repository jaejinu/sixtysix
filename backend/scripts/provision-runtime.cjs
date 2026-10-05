const { Client } = require('pg');
const { configureRuntime } = require('./runtime-privileges.cjs');
async function main() {
  if (!process.env.DIRECT_DATABASE_URL) throw Error('DIRECT_DATABASE_URL_REQUIRED');
  const url = new URL(process.env.DIRECT_DATABASE_URL);
  if (!['postgres:','postgresql:'].includes(url.protocol) || url.hostname.includes('-pooler')) throw Error('DIRECT_POSTGRES_CONNECTION_REQUIRED');
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  try {
    await client.connect();
    await configureRuntime(client, process.env.RUNTIME_ROLE ?? '', process.env.RUNTIME_ROLE_PASSWORD);
    console.log('Runtime grants applied; existing passwords were not changed. Verify using the runtime connection before switching the app.');
  } finally { await client.end(); }
}
main().catch(error => {
  const safe = ['DIRECT_DATABASE_URL_REQUIRED','DIRECT_POSTGRES_CONNECTION_REQUIRED','INVALID_RUNTIME_ROLE','RUNTIME_PASSWORD_REQUIRED','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];
  console.error(safe.includes(error.message) ? error.message : `RUNTIME_PROVISION_FAILED (${/^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : 'UNKNOWN'})`);
  process.exitCode = 1;
});
