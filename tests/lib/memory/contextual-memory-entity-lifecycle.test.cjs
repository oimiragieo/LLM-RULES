'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
const {
  ensureEntityDbInitialized,
  syncJsonMemory,
} = require('../../../.claude/hooks/memory/sync-memory-index.cjs');

test('ContextualMemory entity lifecycle initializes schema and queries without table errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-entity-life-'));
  try {
    const dbPath = path.join(root, '.claude', 'context', 'data', 'memory.db');
    const memoryDir = path.join(root, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    ensureEntityDbInitialized(dbPath);

    const memory = new ContextualMemory({ projectRoot: root, dbPath, memoryDir });
    const query = memory._getEntityQuery();
    assert.ok(query, 'entity query should initialize');

    const rows = await memory.findEntities('decision', { limit: 5 });
    assert.ok(Array.isArray(rows));
    memory.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('syncJsonMemory followed by ContextualMemory query works on fresh DB', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-sync-query-'));
  try {
    const dbPath = path.join(root, '.claude', 'context', 'data', 'memory.db');
    const memoryDir = path.join(root, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    const patternsPath = path.join(memoryDir, 'patterns.json');
    fs.writeFileSync(
      patternsPath,
      JSON.stringify([{ text: 'prefer small cohesive modules' }], null, 2)
    );

    ensureEntityDbInitialized(dbPath);
    syncJsonMemory(patternsPath, dbPath);

    const memory = new ContextualMemory({ projectRoot: root, dbPath, memoryDir });
    const entities = await memory.findEntities('pattern', { limit: 10 });
    assert.ok(Array.isArray(entities));
    assert.ok(entities.length >= 1, 'expected synced pattern entity');
    memory.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
