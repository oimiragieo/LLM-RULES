'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SPAWN_TEMPLATES_DIR = path.join(PROJECT_ROOT, '.claude', 'templates', 'spawn');

function readTemplate(name) {
  return fs.readFileSync(path.join(SPAWN_TEMPLATES_DIR, name), 'utf8');
}

test('active spawn templates use <ID> placeholders instead of hardcoded task identifiers', () => {
  const templates = [
    'universal-agent-spawn.md',
    'orchestrator-spawn.md',
    'agent-identity-integration.md',
    'subordinate-once.md',
  ];

  for (const templateName of templates) {
    const content = readTemplate(templateName);

    assert.equal(
      /\btask-1\b/.test(content),
      false,
      `${templateName} should not contain hardcoded task-1`
    );
    assert.equal(
      /TaskUpdate\(\{\s*taskId:\s*"1"/.test(content),
      false,
      `${templateName} should not contain hardcoded numeric taskId "1"`
    );
    assert.ok(
      /<ID>/.test(content),
      `${templateName} should use <ID> placeholder for task substitution`
    );
  }
});
