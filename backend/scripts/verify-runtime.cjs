const { Client } = require('pg');
const { runtimePolicy, assertRole } = require('./runtime-privileges.cjs');
async function verifyPrivileges(client, role, policy) {
  const { grants, functions, validateName } = policy;
  validateName(role);await assertRole(client, role);
  const violations=[];
  const db=(await client.query(`SELECT has_database_privilege($1,current_database(),'CREATE') AS create,
    has_database_privilege($1,current_database(),'TEMP') AS temp`,[role])).rows[0];
  if(db.create||db.temp)violations.push('database DDL');
  const schemas=await client.query(`SELECT nspname,has_schema_privilege($1,oid,'CREATE') AS create
    FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'`,[role]);
  if(schemas.rows.some(row=>row.create))violations.push('schema CREATE');
  const tables=await client.query(`SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('sixtysix','public') AND c.relkind IN ('r','p','v','m','f')`);
  for(const name of Object.keys(grants))if(!tables.rows.some(row=>row.nspname==='sixtysix'&&row.relname===name))violations.push(`missing:${name}`);
  const columns=await client.query(`SELECT n.nspname,c.relname,a.attname,privilege,
    has_column_privilege($1,c.oid,a.attname,privilege) AS allowed,
    has_column_privilege($1,c.oid,a.attname,privilege||' WITH GRANT OPTION') AS grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege
    WHERE n.nspname IN ('sixtysix','public') AND c.relkind IN ('r','p','v','m','f')`,[role]);
  for(const row of columns.rows){
    const allowed=row.nspname==='sixtysix'?grants[row.relname]??{}:{};
    const expected=row.privilege==='SELECT'?!!allowed.select:(allowed[row.privilege.toLowerCase()]??[]).includes(row.attname);
    if(row.allowed!==expected||row.grantable)violations.push(`${row.relname}.${row.attname}:${row.privilege}`);
  }
  const tableRights=await client.query(`SELECT n.nspname,c.relname,privilege,
    has_table_privilege($1,c.oid,privilege) AS allowed,
    has_table_privilege($1,c.oid,privilege||' WITH GRANT OPTION') AS grantable
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest(ARRAY['DELETE','TRUNCATE','TRIGGER']) AS privilege
    WHERE n.nspname IN ('sixtysix','public') AND c.relkind IN ('r','p','v','m','f')`,[role]);
  for(const row of tableRights.rows){
    const allowed=row.nspname==='sixtysix'?grants[row.relname]??{}:{};
    if(row.allowed!==(row.privilege==='DELETE'&&!!allowed.delete)||row.grantable)violations.push(`${row.relname}:${row.privilege}`);
  }
  const funcs=await client.query(`SELECT p.oid,n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,
    has_function_privilege($1,p.oid,'EXECUTE') AS allowed,has_function_privilege($1,p.oid,'EXECUTE WITH GRANT OPTION') AS grantable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sixtysix'`,[role]);
  for(const row of funcs.rows)if(row.allowed!==functions.includes(row.name)||row.grantable)violations.push(`function:${row.name}`);
  for(const name of functions)if(!funcs.rows.some(row=>row.name===name))violations.push(`missing:${name}`);
  if(violations.length)throw Error('RUNTIME_PRIVILEGE_MISMATCH');
  return {tables:tables.rowCount,functions:funcs.rowCount};
}
async function verifyRuntime(client, role) { return verifyPrivileges(client,role,runtimePolicy); }
async function main(){
  if(!process.env.APP_DATABASE_URL)throw Error('APP_DATABASE_URL_REQUIRED');
  const client=new Client({connectionString:process.env.APP_DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
  try{await client.connect();const role=(await client.query('SELECT current_user AS name')).rows[0].name;const checked=await verifyRuntime(client,role);console.log(JSON.stringify({status:'ok',...checked}));}
  finally{await client.end();}
}
if(require.main===module)main().catch(error=>{const safe=['APP_DATABASE_URL_REQUIRED','INVALID_RUNTIME_ROLE','UNSAFE_RUNTIME_ROLE','RUNTIME_PRIVILEGE_MISMATCH'];console.error(safe.includes(error.message)?error.message:'RUNTIME_VERIFY_FAILED');process.exitCode=1;});
module.exports={verifyRuntime,verifyPrivileges};
