const { Client } = require('pg');
const { verifyWorker } = require('./worker-privileges.cjs');
const { runOutbox,options:outboxOptions } = require('./process-outbox.cjs');
function options(args){
  try{return outboxOptions(args);}catch{throw Error('INVALID_SCHEDULE_OPTIONS');}
}
function connectionString(env=process.env){
  if(!env.WORKER_DATABASE_URL)throw Error('WORKER_DATABASE_URL_REQUIRED');
  let url;try{url=new URL(env.WORKER_DATABASE_URL);}catch{throw Error('INVALID_WORKER_DATABASE_URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!/^sixtysix_worker(?:_[a-z0-9_]+)?$/.test(decodeURIComponent(url.username))||
    [...url.searchParams.keys()].some(key=>!['sslmode','channel_binding','connect_timeout'].includes(key)))throw Error('INVALID_WORKER_DATABASE_URL');
  return env.WORKER_DATABASE_URL;
}
async function runScheduledWork(client,{batch,apply}){
  // Each SQL function/ack is its own transaction. A crash after launch leaves an
  // outbox event; a later run resumes it without repeating the cohort decision.
  const deadline=Date.now()+90000;
  const launch=(await client.query('SELECT sixtysix.settle_due_cohorts($1,$2) AS value',[batch,!apply])).rows[0].value;
  const delivery=await runOutbox(client,{batch,apply,deadline});
  const status=(await client.query('SELECT sixtysix.scheduled_work_status() AS value')).rows[0].value;
  return {apply,limit:batch,launch,delivery,status,budgetExhausted:Date.now()>=deadline};
}
async function main(){
  const config=options(process.argv.slice(2));
  const client=new Client({connectionString:connectionString(),connectionTimeoutMillis:5000,statement_timeout:10000});
  try{
    await client.connect();await verifyWorker(client,(await client.query('SELECT current_user AS name')).rows[0].name);
    const result=await runScheduledWork(client,config);console.log(JSON.stringify(result));
    // Failed jobs remain available for diagnosis; make the scheduled run visible
    // as unsuccessful until an operator resolves them, never silently drop them.
    if(config.apply&&result.status.outbox.failed>0){console.error('OUTBOX_FAILED_JOBS_PRESENT');process.exitCode=1;}
  }finally{await client.end();}
}
if(require.main===module)main().catch(error=>{
  const safe=['WORKER_DATABASE_URL_REQUIRED','INVALID_WORKER_DATABASE_URL','INVALID_WORKER_ROLE','INVALID_SCHEDULE_OPTIONS','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];
  console.error(safe.includes(error.message)?error.message:'SCHEDULED_WORK_FAILED');process.exitCode=1;
});
module.exports={options,connectionString,runScheduledWork};
