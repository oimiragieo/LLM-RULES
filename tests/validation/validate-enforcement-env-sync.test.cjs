'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let validator;
try {
  validator = require('../../scripts/validation/validate-enforcement-env-sync.cjs');
} catch (_err) {
  validator = null;
}

test('validator module exists and exports parseEnvExampleVars', () => {
  assert.ok(validator, 'validate-enforcement-env-sync.cjs should be loadable');
  assert.equal(typeof validator.parseEnvExampleVars, 'function');
});

test('detects missing enforcement variable from hooks/docs in env example', () => {
  assert.ok(validator, 'validator should be available');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-sync-'));
  const hooksRoot = path.join(tmpDir, '.claude', 'hooks');
  const docsPath = path.join(tmpDir, '.claude', 'docs', '@ENVIRONMENT_CONFIG.md');
  const envExample = path.join(tmpDir, '.env.example');

  fs.mkdirSync(path.join(hooksRoot, 'routing'), { recursive: true });
  fs.mkdirSync(path.dirname(docsPath), { recursive: true });

  fs.writeFileSync(
    path.join(hooksRoot, 'routing', 'sample.cjs'),
    'if (process.env.TASKUPDATE_FIRST_ENFORCEMENT === "off") { return; }\n',
    'utf8'
  );
  fs.writeFileSync(docsPath, '`TASKUPDATE_FIRST_ENFORCEMENT`', 'utf8');
  fs.writeFileSync(envExample, '# TASKLIST_FIRST_ENFORCEMENT=block\n', 'utf8');

  const result = validator.main([
    'node',
    'validate-enforcement-env-sync.cjs',
    '--hooks-root',
    hooksRoot,
    '--env-doc',
    docsPath,
    '--env-example',
    envExample,
    '--no-strict',
  ]);

  assert.ok(result.missing.includes('TASKUPDATE_FIRST_ENFORCEMENT'));
});

test('repo env example includes all required enforcement variables', () => {
  assert.ok(validator, 'validator should be available');
  const result = validator.main(['node', 'validate-enforcement-env-sync.cjs', '--no-strict']);
  assert.equal(result.missingCount, 0, `missing enforcement vars: ${result.missing.join(', ')}`);
});
