'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const {
  readMemory,
  writeMemory,
  listMemories,
  deleteMemory,
} = require('../../../.claude/lib/memory/memory-manager.cjs');

test('named memory CRUD and normalization', () => {
  const testRoot = path.join(PROJECT_ROOT, '.claude', 'staging', 'named-memory-test-' + Date.now());

  try {
    const writeMessage = writeMemory('Project Setup', 'hello', testRoot);
    assert.equal(writeMessage, "Memory 'Project Setup' written.");

    const content = readMemory('project_setup', testRoot);
    assert.equal(content, 'hello');

    const names = listMemories(testRoot);
    assert.equal(names.includes('project_setup'), true);

    const deleteMessage = deleteMemory('Project Setup', testRoot);
    assert.equal(deleteMessage, "Memory 'Project Setup' deleted.");

    const missing = readMemory('Project Setup', testRoot);
    assert.match(missing, /not found/i);
  } finally {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  }
});
