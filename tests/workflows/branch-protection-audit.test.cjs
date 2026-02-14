const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow() {
  return fs.readFileSync(path.join('.github', 'workflows', 'branch-protection-audit.yml'), 'utf8');
}

test('branch protection audit requires creator ecosystem validation check', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /creator-ecosystem-validation/);
});

test('branch protection audit requires commands and skills validation checks', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /validate-commands/);
  assert.match(workflow, /validate-skills/);
});

test('branch protection issue body derives bullets from expectedChecks list', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /const expectedChecks = \[/);
  assert.match(workflow, /\.\.\.expectedChecks\.map\(\(name\) => `- \$\{name\}`\)/);
});

test('branch protection expectedChecks include all governance gates', () => {
  const workflow = readWorkflow();
  const requiredChecks = [
    'memory-ci',
    'memory-mvp-gate',
    'nightly-strict-gate',
    'creator-ecosystem-validation',
    'validate-commands',
    'validate-skills',
  ];

  for (const check of requiredChecks) {
    const escaped = check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workflow, new RegExp(`'${escaped}'`), `missing expected check ${check}`);
  }
});
