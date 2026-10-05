const { configureRole } = require('./runtime-privileges.cjs');
const { verifyPrivileges } = require('./verify-runtime.cjs');
function workerName(role) {
  if (!/^sixtysix_worker(?:_[a-z0-9_]+)?$/.test(role) || role.length > 63) throw Error('INVALID_WORKER_ROLE');
  return `"${role}"`;
}
const workerPolicy = { grants: {}, validateName: workerName, functions: [
  'sixtysix.outbox_status()', 'sixtysix.claim_outbox(integer)',
  'sixtysix.settle_due_cohorts(integer, boolean)', 'sixtysix.scheduled_work_status()',
  'sixtysix.reject_outbox(uuid, uuid, text)', 'sixtysix.deliver_outbox(uuid, uuid)',
] };
async function configureWorker(client,role,password){return configureRole(client,role,password,workerPolicy);}
async function verifyWorker(client,role){return verifyPrivileges(client,role,workerPolicy);}
module.exports={configureWorker,verifyWorker,workerPolicy};
