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

test('branch protection failure issue body lists all required checks as separate bullets', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /- nightly-strict-gate',\s*\n\s*'- creator-ecosystem-validation'/);
  assert.match(workflow, /- validate-commands'/);
  assert.match(workflow, /- validate-skills'/);
});
