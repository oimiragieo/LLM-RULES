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
  normalizeScore,
  LOW_SCORE_THRESHOLD,
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
        makeEntry('dev', { a: 3.5 }), // low (< 4.0)
        makeEntry('dev', { a: 3 }), // low (< 4.0)
        makeEntry('dev', { a: 2 }), // low (< 4.0)
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.consecutiveLowCount, 3);
    });

    it('resets consecutive count when a high score appears', () => {
      writeLog([
        makeEntry('dev', { a: 3 }), // low (< 4.0)
        makeEntry('dev', { a: 7 }), // high — resets
        makeEntry('dev', { a: 3.5 }), // low (< 4.0)
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
        makeEntry('dev', { a: 3.5 }), // low (< 4.0)
        makeEntry('dev', { a: 3 }), // low (< 4.0)
        makeEntry('dev', { a: 2.5 }), // low (< 4.0)
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
        makeEntry('dev', { a: 3.5 }), // low (< 4.0)
        makeEntry('dev', { a: 3 }), // low (< 4.0)
        makeEntry('dev', { a: 2.5 }), // low (< 4.0)
      ]);
      const result = isEvolutionEligible('dev', logPath);
      assert.strictEqual(result.eligible, true);
    });
  });

  // ============================================
  // CTO Directive #2: Score Normalization Tests
  // ============================================

  describe('normalizeScore', () => {
    it('normalizes 0-1 scale scores to 1-10 scale', () => {
      // 0.35 on 0-1 scale -> 3.5 on 1-10 scale
      assert.strictEqual(normalizeScore(0.35), 3.5);
      assert.strictEqual(normalizeScore(0.0), 0);
      assert.strictEqual(normalizeScore(1.0), 10);
      assert.strictEqual(normalizeScore(0.5), 5);
    });

    it('passes through 1-10 scale scores unchanged', () => {
      // Scores > 1.0 are assumed to be on 1-10 scale
      assert.strictEqual(normalizeScore(8.5), 8.5);
      assert.strictEqual(normalizeScore(10), 10);
      assert.strictEqual(normalizeScore(1.1), 1.1);
    });

    it('handles edge case of exactly 1.0 (treats as 0-1 scale)', () => {
      // 1.0 could be either scale, but we normalize it (per CTO directive)
      assert.strictEqual(normalizeScore(1.0), 10);
    });

    it('handles invalid scores gracefully', () => {
      assert.strictEqual(normalizeScore(NaN), NaN);
      assert.strictEqual(normalizeScore(undefined), undefined);
      assert.strictEqual(normalizeScore(null), null);
    });
  });

  describe('score scale handling', () => {
    it('correctly detects low scores on 0-1 scale (VAL-RF-001)', () => {
      // Scores below 0.4 on 0-1 scale = Critical Fail
      // After normalization: 0.35 -> 3.5, which is below threshold 4.0
      writeLog([makeEntry('dev', { completeness: 0.3, accuracy: 0.35, clarity: 0.4 })]);
      const summary = getAgentScoreSummary('dev', logPath);
      // Average: (0.3 + 0.35 + 0.4) / 3 = 0.35 -> normalized to 3.5
      assert.strictEqual(summary.consecutiveLowCount, 1);
      assert.ok(summary.avgScore < LOW_SCORE_THRESHOLD);
    });

    it('correctly detects high scores on 0-1 scale', () => {
      // Scores above 0.7 on 0-1 scale = Pass
      writeLog([makeEntry('dev', { completeness: 0.85, accuracy: 0.9, clarity: 0.8 })]);
      const summary = getAgentScoreSummary('dev', logPath);
      // Average: (0.85 + 0.9 + 0.8) / 3 = 0.85 -> normalized to 8.5
      assert.strictEqual(summary.consecutiveLowCount, 0);
      assert.ok(summary.avgScore >= LOW_SCORE_THRESHOLD);
    });

    it('handles mixed-scale entries gracefully (VAL-RF-003)', () => {
      // Mix of 0-1 and 1-10 entries for same agent
      writeLog([
        makeEntry('dev', { completeness: 8, accuracy: 7.5 }, '2026-01-01T10:00:00Z'), // 1-10 scale
        makeEntry('dev', { completeness: 0.35, accuracy: 0.4 }, '2026-01-01T11:00:00Z'), // 0-1 scale
        makeEntry('dev', { completeness: 3, accuracy: 2.5 }, '2026-01-01T12:00:00Z'), // 1-10 scale (low)
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      // All should be normalized to 1-10 scale
      // Entry 1: (8+7.5)/2 = 7.75 (high)
      // Entry 2: (0.35+0.4)/2*10 = 3.75 (low)
      // Entry 3: (3+2.5)/2 = 2.75 (low)
      assert.strictEqual(summary.entryCount, 3);
      assert.strictEqual(summary.consecutiveLowCount, 2); // Last 2 entries are below threshold
    });

    it('LOW_SCORE_THRESHOLD aligns with rubric Critical Fail (VAL-RF-004/005)', () => {
      // Critical Fail < 0.4 on 0-1 scale = < 4.0 on 1-10 scale
      assert.strictEqual(LOW_SCORE_THRESHOLD, 4.0);
    });

    it('evolution fires for 3+ consecutive low 0-1 scale scores (VAL-RF-006)', () => {
      writeLog([
        makeEntry('dev', { score: 0.3 }),
        makeEntry('dev', { score: 0.35 }),
        makeEntry('dev', { score: 0.25 }),
      ]);
      const summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.consecutiveLowCount, 3);

      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 1);
      assert.strictEqual(underperforming[0].agentId, 'dev');
    });

    it('evolution does NOT fire for well-performing agents (VAL-RF-007)', () => {
      writeLog([
        makeEntry('dev', { score: 0.85 }),
        makeEntry('dev', { score: 0.9 }),
        makeEntry('dev', { score: 0.8 }),
      ]);
      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 0);
    });

    it('protected agents are never flagged (VAL-RF-008)', () => {
      // Router with terrible scores should not be flagged
      writeLog([
        makeEntry('router', { score: 0.1 }),
        makeEntry('router', { score: 0.15 }),
        makeEntry('router', { score: 0.2 }),
      ]);
      const underperforming = getUnderperformingAgents(3, logPath);
      assert.strictEqual(underperforming.length, 0);

      // Also verify isEvolutionEligible rejects protected
      for (const agent of PROTECTED_AGENTS) {
        const result = isEvolutionEligible(agent, logPath);
        assert.strictEqual(result.eligible, false);
        assert.ok(result.reason.includes('protected'));
      }
    });

    it('cooldown prevents rapid re-evolution (VAL-RF-009)', () => {
      const spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
      const recentTime = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago

      // Write a recent evolution request
      fs.writeFileSync(
        spawnRequestPath,
        JSON.stringify([
          {
            id: 'test-123',
            trigger: 'low-score-evolution',
            context: 'Agent dev scored below threshold',
            timestamp: recentTime,
          },
        ])
      );

      writeLog([
        makeEntry('dev', { score: 0.3 }),
        makeEntry('dev', { score: 0.35 }),
        makeEntry('dev', { score: 0.25 }),
      ]);

      // Override spawn request path for testing
      const originalPath = path.resolve(
        __dirname,
        '../../.claude/context/runtime/reflection-spawn-request.json'
      );

      // We need to test cooldown - the implementation uses hardcoded path
      // For now, verify the logic works with a real file
      const realRuntimeDir = path.dirname(originalPath);
      if (!fs.existsSync(realRuntimeDir)) {
        fs.mkdirSync(realRuntimeDir, { recursive: true });
      }
      fs.writeFileSync(
        originalPath,
        JSON.stringify([
          {
            id: 'test-456',
            trigger: 'low-score-evolution',
            context: 'Agent dev scored below threshold',
            timestamp: recentTime,
          },
        ])
      );

      const result = isEvolutionEligible('dev', logPath);
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('cooldown') || result.reason.includes('24h'));

      // Cleanup
      fs.rmSync(originalPath, { force: true });
    });
  });

  describe('CTO Directive #2: Defensive normalization', () => {
    it('handles both scales without configuration (VAL-RF-002)', () => {
      // Entry with 1-10 scale score
      writeLog([makeEntry('dev', { completeness: 7.5 })]);
      let summary = getAgentScoreSummary('dev', logPath);
      assert.strictEqual(summary.avgScore, 7.5);

      // Entry with 0-1 scale score
      writeLog([makeEntry('qa', { completeness: 0.75 })]);
      summary = getAgentScoreSummary('qa', logPath);
      assert.strictEqual(summary.avgScore, 7.5); // Normalized: 0.75 * 10 = 7.5
    });
  });
});
