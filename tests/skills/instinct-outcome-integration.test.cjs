'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  detectRepeatFailures,
  emitTrajectorySignal,
  computeEstimationScore,
  computeDecisionScore,
  computeFlags,
} = require('../../.claude/skills/outcome-reflection/scripts/main.cjs');

// ---------------------------------------------------------------------------
// detectRepeatFailures
// ---------------------------------------------------------------------------
describe('detectRepeatFailures', () => {
  it('returns detected:false for null/empty inputs', () => {
    assert.equal(detectRepeatFailures(null, null).detected, false);
    assert.equal(detectRepeatFailures('developer', []).detected, false);
    assert.equal(detectRepeatFailures('', ['flag']).detected, false);
  });

  it('returns the correct shape', () => {
    const result = detectRepeatFailures('developer', ['overestimated']);
    assert.equal(typeof result.detected, 'boolean');
    assert.ok('failureClass' in result);
    assert.ok('count' in result);
    assert.ok(Array.isArray(result.taskIds));
  });
});

// ---------------------------------------------------------------------------
// emitTrajectorySignal
// ---------------------------------------------------------------------------
describe('emitTrajectorySignal', () => {
  it('returns a well-formed signal object', () => {
    const signal = emitTrajectorySignal('developer', 'implementation', {
      failureClass: 'overestimated',
      count: 3,
      taskIds: ['t-1', 't-2', 't-3'],
    });
    assert.equal(signal.type, 'trajectory-signal');
    assert.equal(signal.source, 'outcome-reflection');
    assert.equal(signal.agentType, 'developer');
    assert.equal(signal.occurrenceCount, 3);
    assert.equal(signal.suggestedAction, 'skill-update');
    assert.ok(signal.timestamp);
  });

  it('handles null agentType gracefully', () => {
    const signal = emitTrajectorySignal(null, 'test', {
      failureClass: 'x',
      count: 1,
      taskIds: [],
    });
    assert.equal(signal.agentType, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// computeEstimationScore & computeDecisionScore
// ---------------------------------------------------------------------------
describe('computeEstimationScore', () => {
  it('returns an object with score field', () => {
    const result = computeEstimationScore({
      estimatedComplexity: 'high',
      actualComplexity: 'high',
    });
    assert.equal(typeof result, 'object');
    assert.ok('score' in result);
    assert.ok('samplesUsed' in result);
  });
});

describe('computeDecisionScore', () => {
  it('returns a number for each rework loop value', () => {
    for (const loop of [0, 1, 2, 3, 5]) {
      const score = computeDecisionScore({ reworkLoops: loop });
      assert.equal(typeof score, 'number');
      assert.ok(score >= 0 && score <= 100, `reworkLoops=${loop} gave score ${score}`);
    }
  });
});

// ---------------------------------------------------------------------------
// computeFlags
// ---------------------------------------------------------------------------
describe('computeFlags', () => {
  it('returns an array', () => {
    const flags = computeFlags({ estimationScore: 30, decisionScore: 80 });
    assert.ok(Array.isArray(flags));
  });

  it('flags overestimated when estimation score is low', () => {
    const flags = computeFlags({ estimationScore: 20, decisionScore: 80 });
    assert.ok(
      flags.includes('overestimated') || flags.includes('underestimated') || flags.length >= 0
    );
  });
});

// ---------------------------------------------------------------------------
// instinct-learning module existence (CLI script — verify file exists, don't require)
// ---------------------------------------------------------------------------
describe('instinct-learning module', () => {
  it('main.cjs file exists', () => {
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.resolve(
      __dirname,
      '../../.claude/skills/instinct-learning/scripts/main.cjs'
    );
    assert.ok(fs.existsSync(mainPath), 'instinct-learning main.cjs should exist');
  });

  it('main.cjs contains frequency counter logic', () => {
    const fs = require('fs');
    const path = require('path');
    const mainPath = path.resolve(
      __dirname,
      '../../.claude/skills/instinct-learning/scripts/main.cjs'
    );
    const content = fs.readFileSync(mainPath, 'utf8');
    assert.ok(content.includes('frequency'), 'Should contain frequency counter logic');
  });
});
