const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const workflowFiles = [
  'creator-ecosystem-validate.yml',
  'skill-build-validate.yml',
  'commands-validate.yml',
];

const requiredTriggerPaths = [
  '.claude/skills/**',
  '.claude/agents/**',
  '.claude/commands/**',
  '.claude/hooks/**',
  '.claude/tools/**',
  '.claude/rules/**',
  '.claude/templates/**',
  '.claude/workflows/**',
  '.claude/schemas/**',
  '.claude/context/config/agent-skill-matrix.json',
  '.claude/tools/cli/validate-skill-ecosystem.cjs',
  '.claude/tools/cli/validate-agent-skill-references.cjs',
  'package.json',
];

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

test('workflow trigger parity for creator ecosystem enforcement', () => {
  for (const file of workflowFiles) {
    const workflow = readWorkflow(file);
    for (const requiredPath of requiredTriggerPaths) {
      const escaped = requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(workflow, new RegExp(escaped), `${file} missing trigger path: ${requiredPath}`);
    }
  }
});

test('ci-flake-ops stays manual and scheduled only', () => {
  const workflow = readWorkflow('ci-flake-ops.yml');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /push:/);
});
