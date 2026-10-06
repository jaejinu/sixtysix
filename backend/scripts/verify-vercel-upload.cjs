// Validate `vercel deploy --dry --json` before uploading local source.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert.ok(Array.isArray(report.files), 'Missing upload manifest');
const files = report.files.filter(file => (file.mode & 0o170000) !== 0o040000);
assert.ok(files.length > 0, 'Empty deployment');
for (const file of files) {
  assert.equal(file.mode & 0o170000, 0o100000, 'Only regular files may be uploaded');
  assert.ok(file.path === '.vercelignore' || file.path.startsWith('sixtysix-v2/'), 'Unexpected upload scope');
  assert.ok(!file.path.split('/').some(part =>
    part.startsWith('.env') || ['.git', '.vercel', '.agents', 'node_modules', 'dist', 'coverage', '..'].includes(part)),
  'Private or generated file in upload');
}
const names = new Set(files.map(file => file.path));
for (const required of ['api/backend.ts', 'server/app.ts', 'src/ui/App.tsx', 'package.json', 'package-lock.json', 'vercel.json']) {
  assert.ok(names.has(`sixtysix-v2/${required}`), `Missing required app file: ${required}`);
}
console.log(`PASS: ${files.length} upload files; V2 app present; credentials and unrelated source excluded`);
