// Explicit grants: no ALL TABLES grants, no automatic privileges on future tables.
const grants = {
  notifications: { select: true },
  app_users: { select: true, insert: ['id','auth_subject','display_name'], update: ['display_name'] },
  preferences: { select: true, insert: ['user_id'] },
  habits: { select: true },
  policy_versions: { select: true },
  sample_photos: { select: true },
  cohorts: { select: true, update: ['launch_decided_at','cancelled_at','cancellation_reason'] },
  memberships: { select: true, insert: ['user_id','cohort_id','joined_at'], update: ['cancelled_at'] },
  user_cohort_slots: { select: true, insert: ['user_id','membership_id'], delete: true },
  day_entries: { select: true, insert: ['membership_id','cohort_day','kind','created_at','body','sample_photo_ref','visibility'] },
  link_intents: { select: true, insert: ['user_id','session_binding_hash','provider','expires_at'], update: ['verified_provider_subject','verified_at','consumed_at'] },
  idempotency_records: { select: true, insert: ['user_id','scope','key','request_hash','response_status','response_body','expires_at'] },
  outbox: { insert: ['event_type','dedupe_key','payload'] },
  audit_events: { insert: ['actor_id','action','target_type','target_id','request_id','reason_code'] },
  auth_identities: { select: true, insert: ['user_id','provider','subject'], update: ['disabled_at'] },
  auth_sessions: { select: true, insert: ['token_hash','user_id','expires_at'], update: ['reauthenticated_at','revoked_at'] },
  auth_proofs: { select: true, insert: ['provider','subject','purpose','browser_binding_hash','session_binding_hash','link_intent_id'], update: ['consumed_at'] },
  email_challenges: { select: true, insert: ['id','email','browser_binding_hash','code_hash','purpose','intent_id'], update: ['delivery_state','attempts','consumed_at'] },
  auth_rate_limits: { select: true, insert: ['bucket_key','hits','expires_at'], update: ['hits','expires_at'] },
  auth_intents: { select: true, insert: ['id','purpose','provider','target_subject','browser_binding_hash','session_binding_hash','link_intent_id','expires_at'], update: ['proof_id','completed_at'] },
  oauth_states: { select: true, insert: ['state_hash','browser_binding_hash','intent_id','return_to'], update: ['consumed_at'] },
};
const functions = ['sixtysix.utf16_length(text)', 'sixtysix.lock_active_sample_photo(text)', 'sixtysix.cleanup_auth_ephemera(integer, boolean)', 'sixtysix.require_admin(text, boolean)', 'sixtysix.admin_create_cohort(text, uuid, jsonb)', 'sixtysix.admin_cancel_cohort(text, uuid, uuid, text)'];
function roleName(role) {
  if (!/^sixtysix_runtime(?:_[a-z0-9_]+)?$/.test(role) || role.length > 63) throw Error('INVALID_RUNTIME_ROLE');
  return `"${role}"`;
}
async function assertRole(client, role) {
  const result = await client.query(`SELECT oid,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=$1`, [role]);
  const r = result.rows[0];
  if (!r || r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || r.rolinherit || !r.rolcanlogin) throw Error('UNSAFE_RUNTIME_ROLE');
  // NOINHERIT alone does not prevent SET ROLE. Reject every role membership.
  const membership = await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1', [r.oid]);
  const ownership = await client.query(`SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1 AND deptype='o' LIMIT 1`, [r.oid]);
  if (membership.rowCount || ownership.rowCount) throw Error('UNSAFE_RUNTIME_ROLE');
}
async function configureRole(client, role, password, policy) {
  const { grants, functions, validateName } = policy;
  const quoted = validateName(role);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(password ?? '')) throw Error('RUNTIME_PASSWORD_REQUIRED');
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(6666002)');
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!existing.rowCount) {
      // Role and password are strictly validated. Never print this statement.
      await client.query(`CREATE ROLE ${quoted} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${password}'`);
    }
    await assertRole(client, role);
    const db = (await client.query('SELECT current_database() AS name')).rows[0].name;
    const dbName = '"' + db.replaceAll('"','""') + '"';
    await client.query(`REVOKE CREATE,TEMPORARY ON DATABASE ${dbName} FROM PUBLIC,${quoted}`);
    await client.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${quoted}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM ${quoted}`);
    await client.query(`REVOKE ALL ON SCHEMA sixtysix FROM PUBLIC,${quoted}; GRANT USAGE ON SCHEMA sixtysix TO ${quoted}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA sixtysix FROM PUBLIC,${quoted}; REVOKE ALL ON ALL SEQUENCES IN SCHEMA sixtysix FROM PUBLIC,${quoted}`);
    await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sixtysix FROM PUBLIC,${quoted}`);
    // Table-level REVOKE leaves old column grants intact. Reset these too.
    const columns = await client.query(`SELECT table_name,array_agg(column_name::text ORDER BY ordinal_position) AS columns
      FROM information_schema.columns WHERE table_schema='sixtysix' GROUP BY table_name`);
    for (const row of columns.rows) {
      const q = value => '"' + value.replaceAll('"','""') + '"';
      const names = row.columns.map(q).join(',');
      await client.query(`REVOKE SELECT (${names}),INSERT (${names}),UPDATE (${names}),REFERENCES (${names}) ON sixtysix.${q(row.table_name)} FROM PUBLIC,${quoted}`);
    }
    for (const [table, allowed] of Object.entries(grants)) {
      const permissions = [];
      if (allowed.select) permissions.push('SELECT');
      if (allowed.delete) permissions.push('DELETE');
      for (const type of ['insert','update']) if (allowed[type]) permissions.push(`${type.toUpperCase()} (${allowed[type].join(',')})`);
      await client.query(`GRANT ${permissions.join(',')} ON sixtysix.${table} TO ${quoted}`);
    }
    for (const name of functions) await client.query(`GRANT EXECUTE ON FUNCTION ${name} TO ${quoted}`);
    // New application functions are private until explicitly reviewed and granted.
    await client.query('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
    for(const scope of ['', ' IN SCHEMA sixtysix']){
      for(const type of ['TABLES','SEQUENCES','FUNCTIONS'])await client.query(`ALTER DEFAULT PRIVILEGES${scope} REVOKE ALL ON ${type} FROM PUBLIC,${quoted}`);
    }
    const { verifyPrivileges } = require('./verify-runtime.cjs');
    await verifyPrivileges(client,role,policy);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
const runtimePolicy = { grants, functions, validateName: roleName };
async function configureRuntime(client, role, password) {
  return configureRole(client, role, password, runtimePolicy);
}
module.exports = { grants, functions, roleName, assertRole, configureRuntime, configureRole, runtimePolicy };
