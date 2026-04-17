'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync('package.json', 'utf8'));
}

test('ci workflow wires advisory changed-files, impacted-validation, release-gate summary, and artifact upload', () => {
  const workflow = readWorkflow('ci.yml');

  assert.match(workflow, /name:\s*Collect changed files/);
  assert.match(workflow, /id:\s*changed-files/);
  assert.match(workflow, /pnpm validate:affected --json/);
  assert.match(workflow, /ci:summary:write --kind impacted-validation/);
  assert.match(workflow, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(workflow, /pnpm release:gate --json/);
  assert.match(workflow, /ci:summary:write --kind release-gate/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /ci-advisory-/);
});

test('package scripts expose ci summary and artifact index helpers for workflow use', () => {
  const scripts = readPackageJson().scripts;

  assert.equal(typeof scripts['ci:summary:write'], 'string');
  assert.match(scripts['ci:summary:write'], /ci-write-summary\.cjs/);
  assert.equal(typeof scripts['ci:artifact:index'], 'string');
  assert.match(scripts['ci:artifact:index'], /ci-artifact-index\.cjs/);
});
