#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createStorageHelpers,
} = require('../../../.claude/lib/memory/memory-manager-core-storage.cjs');

function makeHelpers(projectRoot) {
  return createStorageHelpers({
    PROJECT_ROOT: projectRoot,
    validatePathWithinProject: filePath => ({ safe: !!filePath }),
    validateProjectRoot: root => {
      if (!root) throw new Error('invalid root');
    },
    getMemoryDir: root => path.join(root, '.claude', 'context', 'memory'),
    ensureDir: dir => fs.mkdirSync(dir, { recursive: true }),
  });
}

describe('memory-manager-core-storage.writeMemoryArray', () => {
  it('preserves entry.text after sanitizer pass', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-mmcs-'));
    const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
    const filePath = path.join(memoryDir, 'gotchas.json');

    const storage = makeHelpers(projectRoot);
    const input = [{ id: 'g1', text: 'safe content', area: 'memory', timestamp: '2026-02-18' }];

    storage.writeMemoryArray(filePath, input);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].text, 'safe content');
  });
});
