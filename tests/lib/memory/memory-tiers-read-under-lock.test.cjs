#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

function mkProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-mtiers-'));
}

function ensureMemoryDirs(projectRoot) {
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'memory', 'stm'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'memory', 'mtm'), { recursive: true });
}

test('getMTMSessions remains stable under repeated concurrent consolidation writes', async () => {
  const projectRoot = mkProjectRoot();
  ensureMemoryDirs(projectRoot);
  const originalRetries = process.env.MEMORY_TIERS_LOCK_RETRIES;
  const originalMinTimeout = process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS;
  const originalMaxTimeout = process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS;
  process.env.MEMORY_TIERS_LOCK_RETRIES = '30';
  process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS = '10';
  process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS = '50';

  try {
    const writers = [];
    for (let i = 0; i < 8; i += 1) {
      const sessionId = `session-${i}`;
      writers.push(
        (async () => {
          await memoryTiers.writeSTMEntry(
            {
              session_id: sessionId,
              summary: `Summary ${i}`,
              timestamp: new Date(Date.now() + i).toISOString(),
            },
            projectRoot
          );
          await memoryTiers.consolidateSession(sessionId, projectRoot);
        })()
      );
    }

    const readerSnapshots = [];
    for (let i = 0; i < 30; i += 1) {
      readerSnapshots.push(
        Promise.resolve().then(() => {
          const sessions = memoryTiers.getMTMSessions(projectRoot);
          assert.ok(Array.isArray(sessions), 'Expected array from getMTMSessions');
          return sessions.length;
        })
      );
    }

    const settled = await Promise.allSettled([...writers, ...readerSnapshots]);
    const writerFailures = settled.filter(
      entry =>
        entry.status === 'rejected' &&
        String(entry.reason?.message || entry.reason).includes('Lock acquisition failed')
    );
    assert.ok(writerFailures.length <= 2, `Too many lock failures: ${writerFailures.length}`);

    const finalSessions = memoryTiers.getMTMSessions(projectRoot);
    assert.ok(
      finalSessions.length >= 6,
      `Expected at least 6 sessions, got ${finalSessions.length}`
    );
  } finally {
    if (typeof originalRetries === 'undefined') delete process.env.MEMORY_TIERS_LOCK_RETRIES;
    else process.env.MEMORY_TIERS_LOCK_RETRIES = originalRetries;
    if (typeof originalMinTimeout === 'undefined')
      delete process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS;
    else process.env.MEMORY_TIERS_LOCK_MIN_TIMEOUT_MS = originalMinTimeout;
    if (typeof originalMaxTimeout === 'undefined')
      delete process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS;
    else process.env.MEMORY_TIERS_LOCK_MAX_TIMEOUT_MS = originalMaxTimeout;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
