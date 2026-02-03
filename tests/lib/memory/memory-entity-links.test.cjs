'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const {
  linkMemoryToTools,
  getMemoriesForTool,
} = require('../../../.claude/lib/memory/memory-entity-links.cjs');

test('linkMemoryToTools creates memory and skill entities with relationships', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-links-'));
  const memoryId = path.join(projectRoot, 'memories', 'profile.md');

  try {
    const result = linkMemoryToTools(memoryId, ['Skill One', 'Skill Two'], projectRoot);
    assert.equal(result.linked, 2);

    const dbPath = path.join(projectRoot, '.claude', 'data', 'memory.db');
    const db = new DatabaseSync(dbPath);

    const memoryCount = db
      .prepare("SELECT COUNT(*) as count FROM entities WHERE type = 'memory'")
      .get();
    const skillCount = db
      .prepare("SELECT COUNT(*) as count FROM entities WHERE type = 'skill'")
      .get();
    const relFromMemory = db
      .prepare('SELECT COUNT(*) as count FROM entity_relationships WHERE from_entity_id = ?')
      .get(memoryId);
    const relFromSkill = db
      .prepare('SELECT COUNT(*) as count FROM entity_relationships WHERE from_entity_id = ?')
      .get('skill:skill-one');

    db.close();

    assert.equal(memoryCount.count, 1);
    assert.equal(skillCount.count, 2);
    assert.equal(relFromMemory.count, 2);
    assert.equal(relFromSkill.count, 1);

    const linkedMemories = getMemoriesForTool('Skill One', projectRoot);
    assert.deepEqual(linkedMemories, [memoryId]);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
