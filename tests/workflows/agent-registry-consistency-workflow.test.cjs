'use strict';

const test = require('node:test');
const assert = require('node:assert');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function readWorkflow(name) {
  return fs.readFileSync(path.join('.github', 'workflows', name), 'utf8');
}

function extractRunBlock(workflow, stepName) {
  const lines = workflow.split(/\r?\n/);
  let inTargetStep = false;
  let inRunBlock = false;
  let runIndent = 0;
  const collected = [];

  for (const line of lines) {
    if (!inTargetStep) {
      if (line.trim() === `- name: ${stepName}`) {
        inTargetStep = true;
      }
      continue;
    }

    if (!inRunBlock) {
      const runMatch = line.match(/^(\s*)run:\s*\|$/);
      if (runMatch) {
        inRunBlock = true;
        runIndent = runMatch[1].length;
      } else if (line.trim().startsWith('- name: ')) {
        break;
      }
      continue;
    }

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    if (line.trim() && indent <= runIndent) {
      break;
    }
    collected.push(line);
  }

  if (!collected.length) {
    throw new Error(`Unable to extract run block for step: ${stepName}`);
  }

  const contentIndent = collected
    .filter(line => line.trim())
    .reduce((minIndent, line) => {
      const match = line.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      return Math.min(minIndent, indent);
    }, Number.POSITIVE_INFINITY);

  return collected.map(line => line.slice(contentIndent)).join('\n');
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

test('agent-registry-consistency workflow bash is syntactically valid', () => {
  const workflow = readWorkflow('agent-registry-consistency.yml');
  const runBlock = extractRunBlock(workflow, 'Verify registry is up to date');
  const result = childProcess.spawnSync('bash', ['-n'], {
    encoding: 'utf8',
    input: runBlock,
  });

  assert.strictEqual(
    result.status,
    0,
    `bash -n failed for registry consistency workflow step:\n${result.stderr || result.stdout}`
  );
});
