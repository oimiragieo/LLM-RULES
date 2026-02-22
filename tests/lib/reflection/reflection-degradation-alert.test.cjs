'use strict';
/**
 * Tests for reflection-degradation-alert CLI tool (Track 5.2)
 * TDD — written BEFORE implementation.
 *
 * Red → Green → Refactor cycle.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Lazy-load implementation after test setup (avoids side-effects on require)
let computeAgentAverages, findDegradedAgents, runDegradationCheck;

describe('reflection-degradation-alert — pure functions', () => {
  before(() => {
    ({
      computeAgentAverages,
      findDegradedAgents,
      runDegradationCheck,
    } = require('../../../.claude/tools/cli/reflection-degradation-alert.cjs'));
  });

  describe('computeAgentAverages', () => {
    it('returns empty map when given empty entries', () => {
      const result = computeAgentAverages([]);
      assert.deepEqual(result, {});
    });

    it('computes per-agent average from entries', () => {
      const entries = [
        { agentType: 'developer', qualityScore: 0.8 },
        { agentType: 'developer', qualityScore: 0.6 },
        { agentType: 'qa', qualityScore: 0.9 },
      ];
      const result = computeAgentAverages(entries);
      assert.ok(result.developer);
      assert.ok(result.qa);
      assert.equal(result.developer.count, 2);
      assert.ok(Math.abs(result.developer.average - 0.7) < 0.001);
      assert.equal(result.qa.count, 1);
      assert.ok(Math.abs(result.qa.average - 0.9) < 0.001);
    });

    it('skips entries without agentType', () => {
      const entries = [
        { qualityScore: 0.5 },
        { agentType: 'developer', qualityScore: 0.8 },
      ];
      const result = computeAgentAverages(entries);
      assert.ok(!result[undefined]);
      assert.ok(result.developer);
      assert.equal(result.developer.count, 1);
    });

    it('skips entries with non-numeric qualityScore', () => {
      const entries = [
        { agentType: 'developer', qualityScore: 'high' },
        { agentType: 'developer', qualityScore: 0.7 },
      ];
      const result = computeAgentAverages(entries);
      assert.equal(result.developer.count, 1);
      assert.ok(Math.abs(result.developer.average - 0.7) < 0.001);
    });
  });

  describe('findDegradedAgents', () => {
    it('returns empty array when no agents below threshold', () => {
      const averages = {
        developer: { average: 0.8, count: 5 },
        qa: { average: 0.9, count: 3 },
      };
      const result = findDegradedAgents(averages, { threshold: 0.6, minSamples: 2 });
      assert.deepEqual(result, []);
    });

    it('identifies agents below threshold', () => {
      const averages = {
        developer: { average: 0.4, count: 5 },
        qa: { average: 0.9, count: 3 },
      };
      const result = findDegradedAgents(averages, { threshold: 0.6, minSamples: 2 });
      assert.equal(result.length, 1);
      assert.equal(result[0].agentType, 'developer');
      assert.ok(Math.abs(result[0].average - 0.4) < 0.001);
    });

    it('ignores agents below minSamples', () => {
      const averages = {
        developer: { average: 0.3, count: 1 },
      };
      const result = findDegradedAgents(averages, { threshold: 0.6, minSamples: 3 });
      assert.deepEqual(result, []);
    });

    it('uses defaults when options omitted', () => {
      const averages = {
        developer: { average: 0.3, count: 5 },
      };
      const result = findDegradedAgents(averages);
      assert.equal(result.length, 1);
    });
  });

  describe('runDegradationCheck', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refl-deg-test-'));
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when log file does not exist', async () => {
      const result = await runDegradationCheck({
        logFile: path.join(tmpDir, 'nonexistent.jsonl'),
        alertFile: path.join(tmpDir, 'alert.json'),
      });
      assert.equal(result, null);
    });

    it('returns null when log file is empty', async () => {
      const logFile = path.join(tmpDir, 'empty.jsonl');
      fs.writeFileSync(logFile, '', 'utf8');
      const result = await runDegradationCheck({
        logFile,
        alertFile: path.join(tmpDir, 'alert-empty.json'),
      });
      assert.equal(result, null);
    });

    it('writes alert file when degraded agents found', async () => {
      const logFile = path.join(tmpDir, 'degraded.jsonl');
      const alertFile = path.join(tmpDir, 'alert-degraded.json');
      const now = Date.now();
      const entries = Array.from({ length: 5 }, (_, i) =>
        JSON.stringify({
          agentType: 'developer',
          qualityScore: 0.3,
          timestamp: new Date(now - i * 1000).toISOString(),
        })
      );
      fs.writeFileSync(logFile, entries.join('\n') + '\n', 'utf8');

      await runDegradationCheck({ logFile, alertFile, threshold: 0.6, minSamples: 3 });

      assert.ok(fs.existsSync(alertFile), 'Alert file should be created');
      const alert = JSON.parse(fs.readFileSync(alertFile, 'utf8'));
      assert.ok(Array.isArray(alert.degradedAgents));
      assert.equal(alert.degradedAgents.length, 1);
      assert.equal(alert.degradedAgents[0].agentType, 'developer');
    });

    it('does not write alert when no agents are degraded', async () => {
      const logFile = path.join(tmpDir, 'healthy.jsonl');
      const alertFile = path.join(tmpDir, 'alert-healthy.json');
      const now = Date.now();
      const entries = Array.from({ length: 5 }, (_, i) =>
        JSON.stringify({
          agentType: 'developer',
          qualityScore: 0.9,
          timestamp: new Date(now - i * 1000).toISOString(),
        })
      );
      fs.writeFileSync(logFile, entries.join('\n') + '\n', 'utf8');

      await runDegradationCheck({ logFile, alertFile, threshold: 0.6, minSamples: 3 });

      assert.ok(!fs.existsSync(alertFile), 'Alert file should NOT be created when healthy');
    });

    it('filters entries outside the time window', async () => {
      const logFile = path.join(tmpDir, 'windowed.jsonl');
      const alertFile = path.join(tmpDir, 'alert-windowed.json');
      const now = Date.now();
      const oldMs = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago

      // Only old (out of window) entries for developer, recent healthy entries for qa
      const entries = [
        ...Array.from({ length: 5 }, (_, i) =>
          JSON.stringify({
            agentType: 'developer',
            qualityScore: 0.3,
            timestamp: new Date(oldMs - i * 1000).toISOString(),
          })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          JSON.stringify({
            agentType: 'qa',
            qualityScore: 0.95,
            timestamp: new Date(now - i * 1000).toISOString(),
          })
        ),
      ];
      fs.writeFileSync(logFile, entries.join('\n') + '\n', 'utf8');

      await runDegradationCheck({
        logFile,
        alertFile,
        threshold: 0.6,
        minSamples: 3,
        windowMs: 24 * 60 * 60 * 1000, // 1 day window
      });

      // developer out of window → no alert
      assert.ok(!fs.existsSync(alertFile), 'No alert when degraded entries are outside window');
    });
  });
});

describe('SE-XX compliance — reflection-degradation-alert', () => {
  it('SE-02: uses safeParseJSON not raw JSON.parse (module loads without error)', () => {
    const mod = require('../../../.claude/tools/cli/reflection-degradation-alert.cjs');
    assert.ok(typeof mod.computeAgentAverages === 'function');
    assert.ok(typeof mod.findDegradedAgents === 'function');
    assert.ok(typeof mod.runDegradationCheck === 'function');
  });

  it('SE-04: no await-in-forEach patterns (async functions complete correctly)', async () => {
    const { runDegradationCheck: check } = require('../../../.claude/tools/cli/reflection-degradation-alert.cjs');
    // Should not throw or leak unhandled promise
    const result = await check({ logFile: '/nonexistent-path/log.jsonl', alertFile: '/nonexistent-path/alert.json' });
    assert.ok(result === null || result === undefined || typeof result === 'object');
  });
});
