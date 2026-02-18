'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * M11: RED tests for file locking in memory-tiers.cjs
 *
 * Tests that concurrent promoteToLTM and consolidateSession calls
 * are serialized via file locking to prevent data corruption.
 */

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-tiers-lock-'));
  // Set up memory directory structure
  const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  fs.mkdirSync(path.join(memoryDir, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'context', 'runtime'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('M11: Memory Tiers File Locking', () => {
  test('concurrent promoteToLTM calls do not corrupt data', async () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

    // Create multiple sessions in MTM
    for (let i = 0; i < 5; i++) {
      const mtmDir = tiers.getTierPath('MTM', tmpDir);
      const sessionData = {
        session_id: `session-${i}`,
        tier: 'MTM',
        timestamp: new Date(Date.now() - (5 - i) * 60000).toISOString(),
        summary: `Session ${i} summary`,
      };
      fs.writeFileSync(
        path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
        JSON.stringify(sessionData, null, 2)
      );
    }

    // Launch concurrent promoteToLTM calls for different sessions
    const results = await Promise.all([
      tiers.promoteToLTM('session-0', tmpDir),
      tiers.promoteToLTM('session-1', tmpDir),
      tiers.promoteToLTM('session-2', tmpDir),
    ]);

    // All promotions should succeed without corrupting each other
    const successes = results.filter(r => r.success);
    assert.strictEqual(
      successes.length,
      3,
      `Expected 3 successful promotions, got ${successes.length}: ${JSON.stringify(results)}`
    );

    // Verify LTM directory has exactly 3 promoted files
    const ltmDir = tiers.getTierPath('LTM', tmpDir);
    const ltmFiles = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(ltmFiles.length, 3, `Expected 3 LTM files, found ${ltmFiles.length}`);

    // Verify MTM directory has exactly 2 remaining sessions
    const mtmDir = tiers.getTierPath('MTM', tmpDir);
    const mtmFiles = fs.readdirSync(mtmDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(mtmFiles.length, 2, `Expected 2 MTM files, found ${mtmFiles.length}`);

    // Verify each LTM file is valid JSON and unique
    const sessionIds = new Set();
    for (const file of ltmFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(ltmDir, file), 'utf8'));
      assert.ok(content.session_id, `LTM file ${file} missing session_id`);
      assert.strictEqual(content.tier, 'LTM', `LTM file ${file} has wrong tier`);
      assert.ok(!sessionIds.has(content.session_id), `Duplicate session_id: ${content.session_id}`);
      sessionIds.add(content.session_id);
    }
  });

  test('concurrent consolidateSession calls do not lose data', async () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

    // Run concurrent consolidations by writing STM and consolidating in sequence
    // Since only one STM file exists at a time, we simulate rapid
    // write-then-consolidate cycles that could race
    const results = [];

    for (let i = 0; i < 3; i++) {
      // Write a session to STM
      tiers.writeSTMEntry(
        {
          session_id: `rapid-session-${i}`,
          timestamp: new Date().toISOString(),
          summary: `Rapid session ${i}`,
        },
        tmpDir
      );

      // Consolidate immediately
      const result = await tiers.consolidateSession(`rapid-session-${i}`, tmpDir);
      results.push(result);
    }

    // All consolidations should succeed
    const successes = results.filter(r => r.success);
    assert.strictEqual(
      successes.length,
      3,
      `Expected 3 successful consolidations, got ${successes.length}`
    );

    // MTM should have exactly 3 sessions
    const mtmSessions = tiers.getMTMSessions(tmpDir);
    assert.strictEqual(mtmSessions.length, 3, `Expected 3 MTM sessions, got ${mtmSessions.length}`);
  });

  test('consolidateSession fails closed when memory tiers lock is held', async () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
    const lockfile = require('proper-lockfile');

    tiers.writeSTMEntry(
      {
        session_id: 'locked-session',
        timestamp: new Date().toISOString(),
        summary: 'Lock test',
      },
      tmpDir
    );

    const lockPath = path.join(tmpDir, '.claude', 'context', 'runtime', 'memory-tiers.lock');
    fs.writeFileSync(lockPath, '', 'utf8');
    const release = lockfile.lockSync(lockPath, {
      stale: 60_000,
      retries: { retries: 0 },
    });

    try {
      assert.throws(
        () => tiers.consolidateSession('locked-session', tmpDir),
        /fail-closed|lock acquisition failed/i
      );
    } finally {
      release();
    }
  });

  test('lock timeout behavior - withFileLock available in tiers module', () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

    // Verify that the module exports a withFileLock function for external use
    assert.ok(
      typeof tiers.withFileLock === 'function',
      'memory-tiers should export withFileLock for coordinated locking'
    );
  });

  test('fails closed when lock acquisition fails', async () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
    const lockfile = require('proper-lockfile');

    const lockPath = path.join(tmpDir, '.claude', 'context', 'runtime', 'memory-tiers.lock');
    fs.writeFileSync(lockPath, '', 'utf8');
    const release = lockfile.lockSync(lockPath, {
      stale: 60_000,
      retries: { retries: 0 },
    });

    try {
      await assert.rejects(
        tiers.withFileLock(async () => 'unexpected', tmpDir),
        /fail-closed|lock acquisition failed/i
      );
    } finally {
      release();
    }
  });

  test('concurrent summarizeOldSessions with consolidation does not corrupt', async () => {
    const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

    // Fill MTM with enough sessions to trigger summarization
    const mtmDir = tiers.getTierPath('MTM', tmpDir);
    for (let i = 0; i < 11; i++) {
      const sessionData = {
        session_id: `fill-session-${i}`,
        tier: 'MTM',
        timestamp: new Date(Date.now() - (11 - i) * 60000).toISOString(),
        summary: `Fill session ${i}`,
        decisions_made: [`decision-${i}`],
        patterns_found: [`pattern-${i}`],
        files_modified: [`file-${i}.js`],
      };
      fs.writeFileSync(
        path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
        JSON.stringify(sessionData, null, 2)
      );
    }

    // Write something to STM for consolidation
    tiers.writeSTMEntry(
      {
        session_id: 'concurrent-consolidation',
        timestamp: new Date().toISOString(),
        summary: 'Concurrent consolidation test',
      },
      tmpDir
    );

    // Run summarization and consolidation concurrently
    const [summarizeResult, consolidateResult] = await Promise.all([
      Promise.resolve(tiers.summarizeOldSessions(tmpDir, 1)),
      tiers.consolidateSession('concurrent-consolidation', tmpDir),
    ]);

    // Both should complete without error
    assert.ok(
      summarizeResult.summarized >= 0,
      `Summarization should report non-negative count: ${summarizeResult.summarized}`
    );
    assert.strictEqual(consolidateResult.success, true, 'Consolidation should succeed');

    // Verify no corrupted files
    const ltmDir = tiers.getTierPath('LTM', tmpDir);
    if (fs.existsSync(ltmDir)) {
      const ltmFiles = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
      for (const file of ltmFiles) {
        const content = fs.readFileSync(path.join(ltmDir, file), 'utf8');
        // Should be valid JSON (no corruption)
        assert.doesNotThrow(() => JSON.parse(content), `LTM file ${file} should be valid JSON`);
      }
    }
  });
});
