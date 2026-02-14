const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

test('creator ecosystem workflow exists and enforces ecosystem gate with report verification', () => {
  const workflow = readWorkflow('creator-ecosystem-validate.yml');

  assert.match(workflow, /name:\s*Creator Ecosystem Validation/);
  assert.match(workflow, /agent-skill-matrix\.json/);
  assert.match(workflow, /pnpm skills:ecosystem:gate/);
  assert.match(workflow, /validate-agent-skill-references\.cjs/);
  assert.match(workflow, /skill-ecosystem-audit-\*\.json/);
});

test('creator ecosystem workflow watches top-level ecosystem artifact directories', () => {
  const workflow = readWorkflow('creator-ecosystem-validate.yml');

  const requiredPaths = [
    '.claude/commands/**',
    '.claude/hooks/**',
    '.claude/tools/**',
    '.claude/rules/**',
    '.claude/templates/**',
    '.claude/workflows/**',
    '.claude/schemas/**',
  ];

  for (const requiredPath of requiredPaths) {
    const escaped = requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(workflow, new RegExp(escaped));
  }
});

test('creator ecosystem workflow runs status check governance validation in CI', () => {
  const workflow = readWorkflow('creator-ecosystem-validate.yml');
  assert.match(workflow, /pnpm validate:status-check-governance/);
});
