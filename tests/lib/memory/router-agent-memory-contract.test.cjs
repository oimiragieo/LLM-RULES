#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');
const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');

function buildTestRoot(label) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return path.join(__dirname, `.test-memory-contracts-${label}-${suffix}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeTestRootWithRetry(testRoot) {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(testRoot, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 40,
      });
      return;
    } catch (err) {
      const code = err && err.code;
      const retryable =
        code === 'EBUSY' ||
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'ENOTEMPTY' ||
        code === 'EMFILE';
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      await sleep(attempt * 50);
    }
  }
}

async function setup(label) {
  const testRoot = buildTestRoot(label);
  await removeTestRootWithRetry(testRoot);
  fs.mkdirSync(path.join(testRoot, '.claude', 'context', 'memory'), { recursive: true });
  return testRoot;
}

async function cleanup(testRoot) {
  // Allow async file/DB teardown to settle on Windows before recursive delete.
  await sleep(120);
  try {
    await removeTestRootWithRetry(testRoot);
  } catch (_err) {
    // Best-effort cleanup; lock-release timing should not fail contract assertions.
  }
}

test('contract: STM->MTM overflow creates LTM summary and remains queryable by agents', async () => {
  const testRoot = await setup('overflow');
  let contextualMemory = null;
  try {
    for (let i = 0; i < 14; i++) {
      memoryTiers.writeSTMEntry(
        {
          session_id: `session-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          summary: `agent summary ${i}`,
          tasks_completed: [`task-${i}`],
        },
        testRoot
      );
      const consolidated = await memoryTiers.consolidateSession(`session-${i}`, testRoot);
      assert.equal(consolidated.success, true);
    }

    contextualMemory = new ContextualMemory({ projectRoot: testRoot });
    const mem = contextualMemory.loadContextSync({
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
    if (contextualMemory) {
      try {
        contextualMemory.close();
      } catch (_err) {
        // Best-effort cleanup in tests.
      }
    }
    await cleanup(testRoot);
  }
});

test('contract: concurrent agent writes share memory without overwrite', async () => {
  const testRoot = await setup('concurrent');
  try {
    const writesPerAgent = 12;
    const writes = [];
    for (let i = 0; i < writesPerAgent; i++) {
      writes.push(memoryManager.recordPatternAsync({ text: `agent-A-pattern-${i}` }, testRoot));
      writes.push(memoryManager.recordPatternAsync({ text: `agent-B-pattern-${i}` }, testRoot));
      writes.push(memoryManager.recordGotchaAsync({ text: `agent-A-gotcha-${i}` }, testRoot));
      writes.push(memoryManager.recordGotchaAsync({ text: `agent-B-gotcha-${i}` }, testRoot));
    }
    await Promise.all(writes);

    const memDir = path.join(testRoot, '.claude', 'context', 'memory');
    const patterns = JSON.parse(fs.readFileSync(path.join(memDir, 'patterns.json'), 'utf8'));
    const gotchas = JSON.parse(fs.readFileSync(path.join(memDir, 'gotchas.json'), 'utf8'));

    assert.ok(patterns.some(p => String(p.text).includes('agent-A-pattern-')));
    assert.ok(patterns.some(p => String(p.text).includes('agent-B-pattern-')));
    assert.ok(gotchas.some(g => String(g.text).includes('agent-A-gotcha-')));
    assert.ok(gotchas.some(g => String(g.text).includes('agent-B-gotcha-')));
  } finally {
    await cleanup(testRoot);
  }
});
