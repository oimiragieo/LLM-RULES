'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

test('agent-registry-consistency workflow normalizes volatile registry timestamps before diffing', () => {
  const workflow = readWorkflow('agent-registry-consistency.yml');

  assert.match(workflow, /name:\s*Agent Registry Consistency/);
  assert.match(workflow, /Regenerate agent registry/);
  assert.match(workflow, /Verify registry is up to date/);
  assert.match(workflow, /git show HEAD:\.claude\/context\/agent-registry\.json/);
  assert.match(workflow, /diff -u/);
  assert.match(workflow, /generatedAt/);
  assert.match(workflow, /lastHealthCheck/);
  assert.match(workflow, /lastFullScan/);
  assert.match(workflow, /lastUpdate/);
  assert.match(workflow, /createdAt/);
  assert.match(workflow, /updatedAt/);
  assert.doesNotMatch(
    workflow,
    /git diff --quiet -- \.claude\/context\/agent-registry\.json/,
    'registry consistency should ignore timestamp-only drift'
  );
});
