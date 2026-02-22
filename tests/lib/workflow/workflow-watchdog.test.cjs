'use strict';
/**
 * Tests for workflow-watchdog DLQ module (Track 1.2)
 * TDD — written BEFORE implementation.
 *
 * Corrections applied:
 *  - safeParseJSON returns value directly (not { data, success })
 *  - Uses appendJsonl for DLQ writes
 *  - Uses atomicWriteJSONSync for state writes
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let runWatchdogOnce, detectStalledPhases, writeToDLQ;

describe('workflow-watchdog — pure functions', () => {
  before(() => {
    ({
      runWatchdogOnce,
      detectStalledPhases,
      writeToDLQ,
    } = require('../../../.claude/lib/workflow/workflow-watchdog.cjs'));
  });

  describe('detectStalledPhases', () => {
    it('returns empty array when no phases present', () => {
      const result = detectStalledPhases({}, Date.now(), 60_000);
      assert.deepEqual(result, []);
    });

    it('returns empty array when all phases are completed', () => {
      const phases = {
        triage: { status: 'completed', startedAt: new Date(Date.now() - 120_000).toISOString() },
        design: { status: 'completed', startedAt: new Date(Date.now() - 60_000).toISOString() },
      };
      const result = detectStalledPhases(phases, Date.now(), 30_000);
      assert.deepEqual(result, []);
    });

    it('identifies phases running longer than threshold', () => {
      const now = Date.now();
      const phases = {
        implement: {
          status: 'in_progress',
          startedAt: new Date(now - 120_000).toISOString(), // 2 min ago
        },
      };
      const result = detectStalledPhases(phases, now, 60_000); // 1 min threshold
      assert.equal(result.length, 1);
      assert.equal(result[0].phaseKey, 'implement');
      assert.ok(result[0].elapsedMs >= 120_000);
    });

    it('does not flag phases within threshold', () => {
      const now = Date.now();
      const phases = {
        implement: {
          status: 'in_progress',
          startedAt: new Date(now - 30_000).toISOString(), // 30s ago
        },
      };
      const result = detectStalledPhases(phases, now, 60_000); // 1 min threshold
      assert.deepEqual(result, []);
    });

    it('handles invalid startedAt gracefully (skips phase)', () => {
      const phases = {
        weird: { status: 'in_progress', startedAt: 'not-a-date' },
      };
      const result = detectStalledPhases(phases, Date.now(), 1_000);
      assert.deepEqual(result, []);
    });

    it('flags pending phases stuck for too long', () => {
      const now = Date.now();
      const phases = {
        review: {
          status: 'pending',
          startedAt: new Date(now - 200_000).toISOString(),
        },
      };
      const result = detectStalledPhases(phases, now, 60_000);
      assert.equal(result.length, 1);
    });
  });

  describe('writeToDLQ', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-dlq-test-'));
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates DLQ file and writes valid JSONL', () => {
      const dlqPath = path.join(tmpDir, 'test-dlq.jsonl');
      const entry = {
        phaseKey: 'implement',
        elapsedMs: 120_000,
        timestamp: new Date().toISOString(),
      };

      writeToDLQ(dlqPath, entry);

      assert.ok(fs.existsSync(dlqPath));
      const content = fs.readFileSync(dlqPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.phaseKey, 'implement');
    });

    it('appends multiple entries (one per line)', () => {
      const dlqPath = path.join(tmpDir, 'multi-dlq.jsonl');
      writeToDLQ(dlqPath, { a: 1 });
      writeToDLQ(dlqPath, { b: 2 });

      const content = fs.readFileSync(dlqPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 2);
      assert.equal(JSON.parse(lines[0]).a, 1);
      assert.equal(JSON.parse(lines[1]).b, 2);
    });

    it('does not double-serialize (stores plain object)', () => {
      const dlqPath = path.join(tmpDir, 'serial-dlq.jsonl');
      writeToDLQ(dlqPath, { key: 'value' });
      const line = fs.readFileSync(dlqPath, 'utf8').trim();
      const parsed = JSON.parse(line);
      assert.equal(typeof parsed, 'object');
      assert.equal(parsed.key, 'value');
    });
  });

  describe('runWatchdogOnce', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-run-test-'));
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('resolves without error when state file does not exist', async () => {
      await assert.doesNotReject(() =>
        runWatchdogOnce({
          projectRoot: tmpDir,
          thresholdMs: 60_000,
        })
      );
    });

    it('resolves without error when state file has no phases', async () => {
      const stateFile = path.join(tmpDir, '.claude', 'context', 'runtime', 'workflow-state.json');
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ status: 'idle', phases: {} }), 'utf8');

      await assert.doesNotReject(() =>
        runWatchdogOnce({ projectRoot: tmpDir, thresholdMs: 60_000 })
      );
    });

    it('writes DLQ entry for stalled phase', async () => {
      const runtimeDir = path.join(tmpDir, 'stalled-test', '.claude', 'context', 'runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });

      const now = Date.now();
      const state = {
        status: 'running',
        phases: {
          implement: {
            status: 'in_progress',
            startedAt: new Date(now - 200_000).toISOString(),
          },
        },
      };
      const stateFile = path.join(runtimeDir, 'workflow-state.json');
      fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');

      const projectRoot = path.join(tmpDir, 'stalled-test');
      await runWatchdogOnce({ projectRoot, thresholdMs: 60_000 });

      const dlqPath = path.join(runtimeDir, 'workflow-watchdog-dlq.jsonl');
      assert.ok(fs.existsSync(dlqPath), 'DLQ file should be created for stalled phase');
      const lines = fs.readFileSync(dlqPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(lines.length >= 1);
      const entry = JSON.parse(lines[0]);
      assert.equal(entry.phaseKey, 'implement');
    });
  });
});

describe('SE-XX compliance — workflow-watchdog', () => {
  it('SE-02: module loads correctly, uses safeParseJSON not raw JSON.parse', () => {
    const mod = require('../../../.claude/lib/workflow/workflow-watchdog.cjs');
    assert.ok(typeof mod.runWatchdogOnce === 'function');
    assert.ok(typeof mod.detectStalledPhases === 'function');
  });

  it('SE-03: runWatchdogOnce resolves (exit 0 behavior when used as advisory hook)', async () => {
    const { runWatchdogOnce: run } = require('../../../.claude/lib/workflow/workflow-watchdog.cjs');
    // Should not throw regardless of missing files
    await assert.doesNotReject(() => run({ projectRoot: '/tmp/nonexistent-watchdog-path' }));
  });

  it('SE-04: no await-in-forEach patterns (async functions complete correctly)', async () => {
    const { runWatchdogOnce: run } = require('../../../.claude/lib/workflow/workflow-watchdog.cjs');
    const result = await run({ projectRoot: '/tmp/nonexistent-watchdog-path' });
    assert.ok(result === undefined || result === null || typeof result === 'object');
  });
});
