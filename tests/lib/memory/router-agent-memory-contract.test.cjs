#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');
const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');

const TEST_ROOT = path.join(__dirname, '.test-memory-contracts');

function setup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_ROOT, '.claude', 'context', 'memory'), { recursive: true });
}

function cleanup() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

test('contract: STM->MTM overflow creates LTM summary and remains queryable by agents', () => {
  setup();
  try {
    for (let i = 0; i < 14; i++) {
      memoryTiers.writeSTMEntry(
        {
          session_id: `session-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          summary: `agent summary ${i}`,
          tasks_completed: [`task-${i}`],
        },
        TEST_ROOT
      );
      const consolidated = memoryTiers.consolidateSession(`session-${i}`, TEST_ROOT);
      assert.equal(consolidated.success, true);
    }

    const mem = new ContextualMemory({ projectRoot: TEST_ROOT }).loadContextSync({
      maxItems: { sessions: 20, gotchas: 20, patterns: 20, decisions: 10, discoveries: 20 },
      maxChars: {
        sessions: 20000,
        gotchas: 2000,
        patterns: 2000,
        decisions: 2000,
        discoveries: 2000,
        legacy: 2000,
      },
    });

    const hasMtm = mem.recent_sessions.some(s => s.source === 'mtm');
    const hasLtm = mem.recent_sessions.some(s => s.source === 'ltm');
    assert.equal(hasMtm, true);
    assert.equal(hasLtm, true);
    assert.ok(mem.recent_sessions.some(s => String(s.summary || '').includes('agent summary')));
  } finally {
    cleanup();
  }
});

test('contract: concurrent agent writes share memory without overwrite', async () => {
  setup();
  try {
    const writes = [];
    for (let i = 0; i < 60; i++) {
      writes.push(memoryManager.recordPatternAsync({ text: `agent-A-pattern-${i}` }, TEST_ROOT));
      writes.push(memoryManager.recordPatternAsync({ text: `agent-B-pattern-${i}` }, TEST_ROOT));
      writes.push(memoryManager.recordGotchaAsync({ text: `agent-A-gotcha-${i}` }, TEST_ROOT));
      writes.push(memoryManager.recordGotchaAsync({ text: `agent-B-gotcha-${i}` }, TEST_ROOT));
    }
    await Promise.all(writes);

    const memDir = path.join(TEST_ROOT, '.claude', 'context', 'memory');
    const patterns = JSON.parse(fs.readFileSync(path.join(memDir, 'patterns.json'), 'utf8'));
    const gotchas = JSON.parse(fs.readFileSync(path.join(memDir, 'gotchas.json'), 'utf8'));

    assert.ok(patterns.some(p => String(p.text).includes('agent-A-pattern-')));
    assert.ok(patterns.some(p => String(p.text).includes('agent-B-pattern-')));
    assert.ok(gotchas.some(g => String(g.text).includes('agent-A-gotcha-')));
    assert.ok(gotchas.some(g => String(g.text).includes('agent-B-gotcha-')));
  } finally {
    cleanup();
  }
});

