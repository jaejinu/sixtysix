const path = require('node:path');
const assert = require('node:assert/strict');
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

async function main() {
  const api = await SwaggerParser.validate(path.join(__dirname, '../openapi.json'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  // OpenAPI maxLength counts codepoints. This contract keyword captures the
  // additional UTF-16 rule; production routes must install the same validation.
  ajv.addKeyword({ keyword: 'x-utf16-max-length', type: 'string',
    validate: (limit, value) => value.trim().length >= 1 && value.trim().length <= limit });
  const request = api.paths['/v1/memberships/{membershipId}/checkins'].post
    .requestBody.content['application/json'].schema;
  const check = ajv.compile(request);
  const base = { text: '오늘도 읽었어요', samplePhotoRef: null, visibility: 'cohort', expectedTargetDay: 23, expectedLate: false };
  const cases = [
    [base, true, 'valid checkin'],
    [{ ...base, userId: 'forged-owner' }, false, 'client owner forbidden'],
    [{ ...base, createdAt: '2026-10-05T00:00:00Z' }, false, 'client time forbidden'],
    [{ ...base, expectedTargetDay: 67 }, false, 'day 67 forbidden'],
    [{ ...base, text: '😀'.repeat(20) }, true, '40 UTF16 units allowed'],
    [{ ...base, text: '😀'.repeat(21) }, false, '42 UTF16 units forbidden'],
    [{ ...base, text: `  ${'가'.repeat(40)}  ` }, true, 'trim before length validation'],
    [{ ...base, text: '가'.repeat(41) }, false, '41 BMP units forbidden'],
    [{ ...base, text: '   ' }, false, 'blank text forbidden'],
    [{ ...base, expectedLate: 'false' }, false, 'boolean type required'],
  ];
  for (const [value, valid, label] of cases) {
    assert.equal(check(value), valid, `${label}: ${JSON.stringify(check.errors)}`);
  }
  const entry = ajv.compile(api.components.schemas.Entry);
  const pass = { id: '00000000-0000-4000-8000-000000000001', membershipId: '00000000-0000-4000-8000-000000000002', kind: 'pass', cohortDay: 1, createdAt: '2026-10-05T00:00:00Z' };
  assert.equal(entry(pass), true);
  assert.equal(entry({ ...pass, text: 'pass has no body' }), false);
  const availability = ajv.compile(api.components.schemas.Availability);
  assert.equal(availability({ ok: false, reason: 'ENDED' }), true);
  assert.equal(availability({ ok: true }), false);
  const notification=ajv.compile(api.components.schemas.Notification);
  const notice={id:pass.id,membershipId:pass.membershipId,type:'cohort.started',generation:'1기',habitName:'걷기',createdAt:pass.createdAt};
  assert.equal(notification(notice),true);assert.equal(notification({...notice,type:'unknown'}),false);assert.equal(notification({...notice,userId:pass.id}),false);
  const createCohort=ajv.compile(api.paths['/v1/admin/cohorts'].post.requestBody.content['application/json'].schema);
  const draft={habitId:pass.id,policyVersion:1,generation:'1기',startDate:'2030-11-02',recruitmentOpensAt:'2030-10-01T00:00:00Z',capacity:30,minParticipants:10};
  assert.equal(createCohort(draft),true);assert.equal(createCohort({...draft,capacity:31}),false);assert.equal(createCohort({...draft,userId:pass.id}),false);assert.equal(createCohort({...draft,startDate:'2030-02-31'}),false);
  console.log(`OpenAPI valid: ${Object.keys(api.paths).length} paths; 21 contract cases passed`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
