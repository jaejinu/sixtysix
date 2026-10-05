const { Client } = require('pg');
const { verifyWorker } = require('./worker-privileges.cjs');
function options(args) {
  if (args.some(arg=>arg!=='--apply'&&!/^--batch=\d+$/.test(arg)) ||
      args.filter(arg=>arg==='--apply').length>1 || args.filter(arg=>arg.startsWith('--batch=')).length>1) throw Error('INVALID_OUTBOX_OPTIONS');
  const batch=Number(args.find(arg=>arg.startsWith('--batch='))?.slice(8)??20);
  if (!Number.isInteger(batch)||batch<1||batch>100) throw Error('INVALID_OUTBOX_OPTIONS');
  return {batch,apply:args.includes('--apply')};
}
async function runOutbox(client,{batch,apply,deadline=Infinity}) {
  const counts={delivered:0,retried:0,failed:0,stale:0};
  if(apply)for(let i=0;i<batch;i++) {
    if(Date.now()>=deadline)break;
    // Claim just before processing so jobs do not wait behind others in a lease.
    const job=(await client.query('SELECT * FROM sixtysix.claim_outbox(1)')).rows[0];
    if(!job)break;
    let state;
    try { state=(await client.query('SELECT sixtysix.deliver_outbox($1,$2) AS state',[job.id,job.lease_token])).rows[0].state; }
    catch { state='retry'; }
    if(state==='delivered'||state==='stale'){counts[state]++;continue;}
    if(state!=='invalid'&&state!=='retry')throw Error('INVALID_OUTBOX_RESULT');
    const rejected=(await client.query('SELECT sixtysix.reject_outbox($1,$2,$3) AS state',
      [job.id,job.lease_token,state==='invalid'?'INVALID_EVENT':'RETRYABLE'])).rows[0].state;
    if(rejected==='stale')counts.stale++;
    else if(rejected==='failed')counts.failed++;
    else if(rejected==='retry')counts.retried++;
    else throw Error('INVALID_OUTBOX_RESULT');
  }
  const status=(await client.query('SELECT sixtysix.outbox_status() AS status')).rows[0].status;
  return {apply,limit:batch,counts,status};
}
async function main(){
  const config=options(process.argv.slice(2));
  if(!process.env.WORKER_DATABASE_URL)throw Error('WORKER_DATABASE_URL_REQUIRED');
  const client=new Client({connectionString:process.env.WORKER_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
  try{
    await client.connect();await verifyWorker(client,(await client.query('SELECT current_user AS name')).rows[0].name);
    console.log(JSON.stringify(await runOutbox(client,config)));
  }finally{await client.end();}
}
if(require.main===module)main().catch(error=>{
  const safe=['WORKER_DATABASE_URL_REQUIRED','INVALID_WORKER_ROLE','INVALID_OUTBOX_OPTIONS','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];
  console.error(safe.includes(error.message)?error.message:'OUTBOX_PROCESS_FAILED');process.exitCode=1;
});
module.exports={options,runOutbox};
