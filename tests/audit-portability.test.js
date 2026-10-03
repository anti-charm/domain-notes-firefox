const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('security audit runs from another directory, including Windows paths with spaces', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '../scripts/security-audit.mjs')], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /0 findings/);
});
