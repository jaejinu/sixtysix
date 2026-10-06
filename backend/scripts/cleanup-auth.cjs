const { Client } = require('pg');
const { verifyRuntime } = require('./verify-runtime.cjs');
function options(args) {
  if(args.some(arg=>arg!=='--apply'&&!/^--batch=\d+$/.test(arg)) || args.filter(arg=>arg==='--apply').length>1 || args.filter(arg=>arg.startsWith('--batch=')).length>1)throw Error('INVALID_CLEANUP_OPTIONS');
  const batch=Number(args.find(arg=>arg.startsWith('--batch='))?.slice(8)??100);
  if(!Number.isInteger(batch)||batch<1||batch>500)throw Error('INVALID_CLEANUP_OPTIONS');
  return {batch,dryRun:!args.includes('--apply')};
}
async function main(){
  const {batch,dryRun}=options(process.argv.slice(2));
  if(!process.env.APP_DATABASE_URL)throw Error('APP_DATABASE_URL_REQUIRED');
  const client=new Client({connectionString:process.env.APP_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
  try{
    await client.connect();const role=(await client.query('SELECT current_user AS name')).rows[0].name;
    await verifyRuntime(client,role);
    const result=await client.query('SELECT sixtysix.cleanup_auth_ephemera($1,$2) AS result',[batch,dryRun]);
    console.log(JSON.stringify(result.rows[0].result));
  }finally{await client.end();}
}
if(require.main===module)main().catch(error=>{
  const safe=['INVALID_CLEANUP_OPTIONS','APP_DATABASE_URL_REQUIRED','INVALID_RUNTIME_ROLE','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];
  console.error(safe.includes(error.message)?error.message:'AUTH_CLEANUP_FAILED');process.exitCode=1;
});
module.exports={options};
