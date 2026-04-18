'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow() {
  return fs.readFileSync(path.join('.github', 'workflows', 'ci-flake-ops.yml'), 'utf8');
}

test('ci-flake-ops workflow runs on schedule and workflow_dispatch only', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /push:/);
});

test('ci-flake-ops workflow enumerates recent artifacts and builds flake summaries', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /actions\/github-script@v7/);
  assert.match(workflow, /listWorkflowRunsForRepo/);
  assert.match(workflow, /listWorkflowRunArtifacts/);
  assert.match(workflow, /pnpm ci:artifact:index --json/);
  assert.match(workflow, /pnpm flake:report --json/);
  assert.match(workflow, /ci:summary:write --kind flake-ops/);
  assert.match(
    workflow,
    /ci-flake-ops-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/
  );
});

test('ci-flake-ops workflow gates issue automation on actionable findings', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /if:\s*steps\.build-flake-summary\.outputs\.actionable == 'true'/);
  assert.match(workflow, /github\.rest\.issues\.(create|createComment)/);
  assert.match(workflow, /ci-flake-ops/);
});
