'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');

test('validate-model-names scans agent models from config.agents', () => {
  const scriptPath = path.join(
    __dirname,
    '..',
    '..',
    'scripts',
    'validation',
    'validate-model-names.mjs'
  );

  const result = cp.spawnSync(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, '..', '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const match = result.stdout.match(/Found (\d+) model references:/);
  assert.ok(match, `Expected model count in output, got:\n${result.stdout}`);
  const count = Number(match[1]);
  assert.ok(count > 10, `Expected >10 model references, got ${count}`);
});
