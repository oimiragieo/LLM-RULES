const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

test('skill-build workflow enforces ecosystem gate', () => {
  const workflow = readWorkflow('skill-build-validate.yml');
  assert.match(workflow, /pnpm skills:ecosystem:gate/);
});

test('commands workflow enforces ecosystem gate', () => {
  const workflow = readWorkflow('commands-validate.yml');
  assert.match(workflow, /pnpm skills:ecosystem:gate/);
});
