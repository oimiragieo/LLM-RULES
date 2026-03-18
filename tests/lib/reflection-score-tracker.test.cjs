'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getAgentScoreSummary,
  getUnderperformingAgents,
  isEvolutionEligible,
  readReflectionLog,
  PROTECTED_AGENTS,
} = require('../../.claude/lib/utils/reflection-score-tracker.cjs');

let tmpDir;
let logPath;

function writeLog(entries) {
  fs.writeFileSync(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

function makeEntry(agentId, scores, timestamp) {
  return {
    agentId,
    scores,
    timestamp: timestamp || new Date().toISOString(),
  };
}

describe('reflection-score-tracker', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'score-tracker-test-'));
    logPath = path.join(tmpDir, 'reflection-log.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readReflectionLog', () => {
    it('returns empty array for missing file', () => {
      const result = readReflectionLog(path.join(tmpDir, 'nonexistent.jsonl'));
      assert.deepStrictEqual(result, []);
    });

    it('skips malformed lines', () => {
      fs.writeFileSync(logPath, 'not json\n{"agentId":"dev","scores":{"a":7}}\n{bad\n');
      const result = readReflectionLog(logPath);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].agentId, 'dev');
    });

    it('skips entries without agentId or scores', () => {
      fs.writeFileSync(
        logPath,
        '{"agentId":"dev"}\n{"scores":{"a":7}}\n{"agentId":"dev","scores":{"a":8}}\n'
      );
      const result = readReflectionLog(logPath);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('getAgentScoreSummary', () => {
    it('returns safe defaults for unknown agent', () => {
      writeLog([makeEntry('other-agent', { accuracy: 8 })]);
      const summary = getAgentScoreSummary('nonexistent', logPath);
      assert.strictEqual(summary.entryCount, 0);
      assert.strictEqual(summary.avgScore, null);
      assert.strictEqual(summary.trend, 'unknown');
      assert.strictEqual(summary.consecutiveLowCount, 0);
    });

    it('computes average score across dimensions', () => {
      writeLog([makeEntry('dev', { accuracy: 8, completeness: 6, coherence: 10 })]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.avgScore, 8); // (8+6+10)/3 = 8
      assert.strictEqual(summary.entryCount, 1);
    });

    it('detects consecutive low scores from the end', () => {
      writeLog([
        makeEntry('dev', { a: 8 }), // high
        makeEntry('dev', { a: 5 }), // low
        makeEntry('dev', { a: 4 }), // low
        makeEntry('dev', { a: 3 }), // low
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.consecutiveLowCount, 3);
    });

    it('resets consecutive count when a high score appears', () => {
      writeLog([
        makeEntry('dev', { a: 4 }), // low
        makeEntry('dev', { a: 7 }), // high — resets
        makeEntry('dev', { a: 5 }), // low
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.consecutiveLowCount, 1);
    });

    it('detects declining trend', () => {
      writeLog([
        makeEntry('dev', { a: 9 }),
        makeEntry('dev', { a: 8.5 }),
        makeEntry('dev', { a: 8 }),
        makeEntry('dev', { a: 7 }),
        makeEntry('dev', { a: 5 }),
        makeEntry('dev', { a: 4 }),
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.trend, 'declining');
    });

    it('detects improving trend', () => {
      writeLog([
        makeEntry('dev', { a: 3 }),
        makeEntry('dev', { a: 4 }),
        makeEntry('dev', { a: 5 }),
        makeEntry('dev', { a: 7 }),
        makeEntry('dev', { a: 8 }),
        makeEntry('dev', { a: 9 }),
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.trend, 'improving');
    });

    it('reports stable trend for small variations', () => {
      writeLog([
        makeEntry('dev', { a: 7 }),
        makeEntry('dev', { a: 7.2 }),
        makeEntry('dev', { a: 6.9 }),
        makeEntry('dev', { a: 7.1 }),
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.trend, 'stable');
    });

    it('limits to rolling window of 10', () => {
      const entries = Array.from({ length: 15 }, (_, i) => makeEntry('dev', { a: i < 12 ? 9 : 3 }));
      writeLog(entries);
      const summary = getAgentScoreSummary('dev', logPath);
      // Only last 10 entries considered (indices 5-14: five 9s then three 3s)
      assert.strictEqual(summary.entryCount, 10);
    });
  });

  describe('getUnderperformingAgents', () => {
    it('returns agents with 3+ consecutive lows', () => {
      writeLog([
        makeEntry('dev', { a: 4 }),
        makeEntry('dev', { a: 3 }),
        makeEntry('dev', { a: 5 }),
        makeEntry('qa', { a: 8 }),
        makeEntry('qa', { a: 9 }),
      ]);
      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 1);
      assert.strictEqual(underperforming[0].agentId, 'dev');
    });

    it('excludes protected agents', () => {
      writeLog([
        makeEntry('router', { a: 2 }),
        makeEntry('router', { a: 1 }),
        makeEntry('router', { a: 3 }),
        makeEntry('planner', { a: 2 }),
        makeEntry('planner', { a: 1 }),
        makeEntry('planner', { a: 3 }),
      ]);
      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 0);
    });

    it('returns empty array when no agents underperform', () => {
      writeLog([makeEntry('dev', { a: 8 }), makeEntry('qa', { a: 9 })]);
      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 0);
    });
  });

  describe('isEvolutionEligible', () => {
    it('rejects protected agents', () => {
      for (const agent of PROTECTED_AGENTS) {
        const result = isEvolutionEligible(agent, logPath);
        assert.strictEqual(result.eligible, false);
        assert.ok(result.reason.includes('protected'));
      }
    });

    it('rejects agents without enough consecutive lows', () => {
      writeLog([makeEntry('dev', { a: 8 }), makeEntry('dev', { a: 5 })]);
      const result = isEvolutionEligible('dev', logPath);
      assert.strictEqual(result.eligible, false);
    });

    it('approves eligible agents with 3+ consecutive lows', () => {
      writeLog([
        makeEntry('dev', { a: 4 }),
        makeEntry('dev', { a: 3 }),
        makeEntry('dev', { a: 5 }),
      ]);
      const result = isEvolutionEligible('dev', logPath);
      assert.strictEqual(result.eligible, true);
    });
  });
});
