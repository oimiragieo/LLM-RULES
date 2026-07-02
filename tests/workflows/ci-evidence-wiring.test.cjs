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

function pinnedActionPattern(actionName) {
  return new RegExp(`${actionName.replace('/', '\\/')}@[a-f0-9]{40}`, 'i');
}

test('ci workflow wires advisory changed-files, impacted-validation, release-gate summary, and artifact upload', () => {
  const workflow = readWorkflow('ci.yml');

  assert.match(workflow, /name:\s*Collect changed files/);
  assert.match(workflow, /id:\s*changed-files/);
  assert.match(workflow, /node\s+\.claude\/tools\/cli\/validate-affected\.cjs\s+--json/);
  assert.match(workflow, /ci:summary:write --kind impacted-validation/);
  assert.match(workflow, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(workflow, /node\s+\.claude\/tools\/cli\/release-gate\.cjs\s+--json/);
  assert.match(workflow, /ci:summary:write --kind release-gate/);
  assert.match(workflow, pinnedActionPattern('actions/upload-artifact'));
  assert.match(workflow, /ci-advisory-/);
  assert.doesNotMatch(workflow, /pnpm validate:affected --json/);
  assert.doesNotMatch(workflow, /pnpm release:gate --json/);
});

test('ci workflow advisory changed-files survives missing push base commits and missing summary inputs', () => {
  const workflow = readWorkflow('ci.yml');

  assert.match(
    workflow,
    /git rev-parse --verify --quiet "\$base_ref\^\{commit\}" >\/dev\/null/,
    'ci.yml should verify the advisory base ref exists before diffing'
  );
  assert.match(
    workflow,
    /base_ref="\$\(git rev-list --max-count=1 HEAD\^ 2>\/dev\/null \|\| git rev-parse HEAD\)"/,
    'ci.yml should fall back to the current branch history when the advisory base ref is unavailable'
  );
  assert.match(
    workflow,
    /if \[\[ -f \.claude\/context\/ci\/impacted-validation\.json \]\]; then/,
    'ci.yml should skip the impacted-validation summary when the advisory JSON was not written'
  );
});

test('package scripts expose ci summary and artifact index helpers for workflow use', () => {
  const scripts = readPackageJson().scripts;

  assert.equal(typeof scripts['ci:summary:write'], 'string');
  assert.match(scripts['ci:summary:write'], /ci-write-summary\.cjs/);
  assert.equal(typeof scripts['ci:artifact:index'], 'string');
  assert.match(scripts['ci:artifact:index'], /ci-artifact-index\.cjs/);
});

test('authoritative workflows upload uniquely named failure evidence artifacts and summaries', () => {
  const workflows = ['full-validation.yml', 'global-quality-gates.yml', 'observability-ci.yml'];

  for (const workflowName of workflows) {
    const workflow = readWorkflow(workflowName);
    assert.match(
      workflow,
      /failure-evidence\.cjs/,
      `${workflowName} missing failure evidence helper`
    );
    assert.match(workflow, /if:\s*failure\(\)/, `${workflowName} missing failure-only step`);
    assert.match(
      workflow,
      pinnedActionPattern('actions/upload-artifact'),
      `${workflowName} missing artifact upload`
    );
    assert.match(
      workflow,
      /failure-evidence-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.job\s*\}\}-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/,
      `${workflowName} missing unique failure artifact naming`
    );
    assert.match(
      workflow,
      /ci:summary:write --kind failure-evidence/,
      `${workflowName} missing failure-evidence summary step`
    );
  }
});

test('full validation wires an authoritative PR-only release governance gate', () => {
  const workflow = readWorkflow('full-validation.yml');
  const releaseGovernanceBlockMatch = workflow.match(
    /release-governance:[\s\S]*?(?=\n\s{2}[a-z0-9-]+:|\n$)/
  );

  assert.match(workflow, /release-governance:/);
  assert.match(workflow, /name:\s*Release Governance/);
  assert.match(workflow, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /Collect changed files/);
  assert.match(workflow, /pull_request\.head\.sha/);
  assert.match(workflow, /--name-status/);
  assert.match(workflow, /--find-renames/);
  assert.match(workflow, /--diff-filter=ACMRD/);
  assert.match(workflow, /changed-files\.tsv/);
  assert.match(workflow, /git show/);
  assert.match(workflow, /node\s+\.claude\/tools\/cli\/release-gate\.cjs\s+--json/);
  assert.match(workflow, /--old/);
  assert.match(workflow, /--new/);
  assert.match(workflow, /--commit-message-file/);
  assert.match(workflow, /release-intent\.txt/);
  assert.match(workflow, /ci:summary:write --kind release-gate/);
  assert.match(workflow, pinnedActionPattern('actions/upload-artifact'));
  assert.match(
    workflow,
    /release-governance-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/
  );
  assert.ok(releaseGovernanceBlockMatch, 'release-governance block should exist');
  assert.doesNotMatch(
    releaseGovernanceBlockMatch[0],
    /--diff-filter=ACMR\b/,
    'authoritative release-governance job must preserve deletions'
  );
  assert.doesNotMatch(
    releaseGovernanceBlockMatch[0],
    /continue-on-error:\s*true/,
    'authoritative release-governance job must not be advisory'
  );
  assert.doesNotMatch(
    releaseGovernanceBlockMatch[0],
    /pnpm release:gate --json/,
    'authoritative release-governance job must emit clean JSON without pnpm banners'
  );
});
