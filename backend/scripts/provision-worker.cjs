const { Client } = require('pg');
const { configureWorker } = require('./worker-privileges.cjs');
async function main(){
  if(!process.env.DIRECT_DATABASE_URL)throw Error('DIRECT_DATABASE_URL_REQUIRED');
  const url=new URL(process.env.DIRECT_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname.includes('-pooler'))throw Error('DIRECT_POSTGRES_CONNECTION_REQUIRED');
  const client=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000,statement_timeout:30000});
  try{await client.connect();await configureWorker(client,process.env.WORKER_ROLE??'',process.env.WORKER_ROLE_PASSWORD);console.log('Worker grants applied; existing passwords unchanged.');}
  finally{await client.end();}
}
main().catch(error=>{
  const safe=['DIRECT_DATABASE_URL_REQUIRED','DIRECT_POSTGRES_CONNECTION_REQUIRED','INVALID_WORKER_ROLE','RUNTIME_PASSWORD_REQUIRED','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];
  console.error(safe.includes(error.message)?error.message:'WORKER_PROVISION_FAILED');process.exitCode=1;
});
