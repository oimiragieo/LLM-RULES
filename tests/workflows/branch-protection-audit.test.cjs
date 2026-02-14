const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow() {
  return fs.readFileSync(path.join('.github', 'workflows', 'branch-protection-audit.yml'), 'utf8');
}

function readChecksConfig() {
  const cfgPath = path.join('.claude', 'config', 'required-status-checks.json');
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

test('branch protection audit loads required checks from config file via GitHub API', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /\.claude\/config\/required-status-checks\.json/);
  assert.match(workflow, /github\.rest\.repos\.getContent\(/);
  assert.match(workflow, /Buffer\.from\(.*base64.*\)/);
  assert.match(workflow, /JSON\.parse\(/);
  assert.match(workflow, /required_checks/);
});

test('branch protection audit uses loaded checks for both validation and issue body', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /expectedChecks = await loadRequiredChecks\(\)/);
  assert.match(workflow, /missing = expectedChecks\.filter/);
  assert.match(workflow, /\.\.\.expectedChecks\.map\(\(name\) => `- \$\{name\}`\)/);
});

test('branch protection audit references same config file in both scripts', () => {
  const workflow = readWorkflow();
  const matches = workflow.match(/\.claude\/config\/required-status-checks\.json/g) || [];
  assert.equal(matches.length >= 2, true);
});

test('required checks config currently includes governance gates expected by policy', () => {
  const checks = readChecksConfig().required_checks;
  const required = [
    'memory-ci',
    'memory-mvp-gate',
    'nightly-strict-gate',
    'creator-ecosystem-validation',
    'validate-commands',
    'validate-skills'
  ];
  for (const check of required) {
    assert.equal(checks.includes(check), true, `missing required check ${check}`);
  }
});

test('branch protection workflow avoids hardcoded expanded check bullets', () => {
  const workflow = readWorkflow();
  assert.doesNotMatch(workflow, /'- creator-ecosystem-validation'/);
  assert.doesNotMatch(workflow, /'- validate-commands'/);
  assert.doesNotMatch(workflow, /'- validate-skills'/);
});
