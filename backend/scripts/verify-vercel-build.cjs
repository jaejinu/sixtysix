const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../../.vercel/output');
const config = JSON.parse(fs.readFileSync(path.join(output, 'config.json'), 'utf8'));
const rewrites = config.routes.filter(route => route.src && route.dest && !route.status);
for (const source of ['/v1/health', '/v1/ready', '/v1/habits', '/v1/cohorts/test/feed']) {
  const route = rewrites.find(item => new RegExp(item.src).test(source));
  assert.ok(route, `missing API route: ${source}`);
  const target = source.replace(new RegExp(route.src), route.dest);
  assert.equal(target, `/api/backend?__route=${source.slice(4)}`);
}
const home = rewrites.find(item => new RegExp(item.src).test('/home'));
assert.equal(home?.dest, '/index.html');
assert.ok(fs.existsSync(path.join(output, 'functions/api/backend.func/.vc-config.json')));
assert.ok(fs.existsSync(path.join(output, 'static/index.html')));
console.log('PASS: Vercel API rewrites (including nested paths), function artifact, SPA fallback');
