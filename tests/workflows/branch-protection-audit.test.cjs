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
