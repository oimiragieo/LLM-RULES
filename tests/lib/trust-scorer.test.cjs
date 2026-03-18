'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TrustScorer,
  SCORE_DEFAULT,
  SCORE_MIN,
  SCORE_MAX,
  MIN_OBSERVATIONS,
  LOW_TRUST_FLOOR,
  DELTA_SUCCESS,
  DELTA_GUARDRAIL_FAILURE,
  DELTA_LOW_REFLECTION,
} = require('../../.claude/lib/routing/trust-scorer.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a scorer with a fixed "now" timestamp so decay is deterministic.
 */
function makeScorer(fixedNowMs, initialState) {
  return new TrustScorer(initialState || {}, () => fixedNowMs);
}

// ---------------------------------------------------------------------------
// Constants / exports
// ---------------------------------------------------------------------------

test('exports SCORE_DEFAULT = 500', () => {
  assert.equal(SCORE_DEFAULT, 500);
});

test('exports SCORE_MIN = 0, SCORE_MAX = 1000', () => {
  assert.equal(SCORE_MIN, 0);
  assert.equal(SCORE_MAX, 1000);
});

test('exports MIN_OBSERVATIONS = 5', () => {
  assert.equal(MIN_OBSERVATIONS, 5);
});

test('exports LOW_TRUST_FLOOR = 0.10', () => {
  assert.equal(LOW_TRUST_FLOOR, 0.1);
});

test('exports correct delta values', () => {
  assert.equal(DELTA_SUCCESS, 10);
  assert.equal(DELTA_GUARDRAIL_FAILURE, -20);
  assert.equal(DELTA_LOW_REFLECTION, -15);
});

// ---------------------------------------------------------------------------
// getScore — defaults
// ---------------------------------------------------------------------------

test('getScore returns SCORE_DEFAULT for unknown agent', () => {
  const scorer = makeScorer(Date.now());
  assert.equal(scorer.getScore('unknown-agent'), SCORE_DEFAULT);
});

test('getScore returns SCORE_DEFAULT for empty string', () => {
  const scorer = makeScorer(Date.now());
  assert.equal(scorer.getScore(''), SCORE_DEFAULT);
});

// ---------------------------------------------------------------------------
// recordSuccess
// ---------------------------------------------------------------------------

test('recordSuccess increments observations', () => {
  const scorer = makeScorer(Date.now());
  scorer.recordSuccess('agent-a');
  const all = scorer.getAllScores();
  assert.equal(all['agent-a'].observations, 1);
});

test('recordSuccess does NOT change score before MIN_OBSERVATIONS', () => {
  const scorer = makeScorer(Date.now());
  // Apply fewer than MIN_OBSERVATIONS records
  for (let i = 0; i < MIN_OBSERVATIONS - 1; i++) {
    scorer.recordSuccess('agent-a');
  }
  assert.equal(scorer.getScore('agent-a'), SCORE_DEFAULT);
});

test('recordSuccess increases score after MIN_OBSERVATIONS', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  // Reach threshold exactly
  for (let i = 0; i < MIN_OBSERVATIONS; i++) {
    scorer.recordSuccess('agent-a');
  }
  // The 5th call IS the MIN_OBSERVATIONS-th observation, so score should increase
  assert.ok(
    scorer.getScore('agent-a') > SCORE_DEFAULT,
    `Expected score > ${SCORE_DEFAULT}, got ${scorer.getScore('agent-a')}`
  );
});

test('recordSuccess does not exceed SCORE_MAX', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-a': {
        score: SCORE_MAX,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  scorer.recordSuccess('agent-a');
  assert.equal(scorer.getScore('agent-a'), SCORE_MAX);
});

// ---------------------------------------------------------------------------
// recordGuardrailFailure
// ---------------------------------------------------------------------------

test('recordGuardrailFailure decrements score after MIN_OBSERVATIONS', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  // Seed observations first
  for (let i = 0; i < MIN_OBSERVATIONS - 1; i++) {
    scorer.recordSuccess('agent-b');
  }
  // This is the MIN_OBSERVATIONS-th — triggers guardrail penalty
  scorer.recordGuardrailFailure('agent-b');
  assert.ok(
    scorer.getScore('agent-b') < SCORE_DEFAULT,
    `Expected score < ${SCORE_DEFAULT}, got ${scorer.getScore('agent-b')}`
  );
});

test('recordGuardrailFailure does NOT change score before MIN_OBSERVATIONS', () => {
  const scorer = makeScorer(Date.now());
  for (let i = 0; i < MIN_OBSERVATIONS - 1; i++) {
    scorer.recordGuardrailFailure('agent-b');
  }
  assert.equal(scorer.getScore('agent-b'), SCORE_DEFAULT);
});

test('recordGuardrailFailure does not go below SCORE_MIN', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-a': {
        score: SCORE_MIN,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  scorer.recordGuardrailFailure('agent-a');
  assert.equal(scorer.getScore('agent-a'), SCORE_MIN);
});

// ---------------------------------------------------------------------------
// recordLowReflectionScore
// ---------------------------------------------------------------------------

test('recordLowReflectionScore decrements score after MIN_OBSERVATIONS', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  for (let i = 0; i < MIN_OBSERVATIONS - 1; i++) {
    scorer.recordSuccess('agent-c');
  }
  scorer.recordLowReflectionScore('agent-c');
  assert.ok(
    scorer.getScore('agent-c') < SCORE_DEFAULT,
    `Expected score < ${SCORE_DEFAULT}, got ${scorer.getScore('agent-c')}`
  );
});

test('recordLowReflectionScore applies -15 delta (vs guardrail -20)', () => {
  const now = Date.now();
  // Seed 100 observations so the floor is gone
  const scorer = new TrustScorer(
    {
      'agent-c': {
        score: SCORE_DEFAULT,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  scorer.recordLowReflectionScore('agent-c');
  assert.equal(scorer.getScore('agent-c'), SCORE_DEFAULT + DELTA_LOW_REFLECTION);
});

// ---------------------------------------------------------------------------
// Score deltas match spec
// ---------------------------------------------------------------------------

test('delta magnitudes: guardrail (-20) is larger penalty than low-reflection (-15)', () => {
  const now = Date.now();
  const base = new TrustScorer(
    {
      'agent-x': {
        score: SCORE_DEFAULT,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  const baseline = base.getScore('agent-x');

  const scorerA = new TrustScorer(
    {
      'agent-x': {
        score: SCORE_DEFAULT,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  scorerA.recordGuardrailFailure('agent-x');

  const scorerB = new TrustScorer(
    {
      'agent-x': {
        score: SCORE_DEFAULT,
        observations: 100,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  scorerB.recordLowReflectionScore('agent-x');

  assert.ok(
    scorerA.getScore('agent-x') < scorerB.getScore('agent-x'),
    'Guardrail failure should result in a lower score than low reflection'
  );
  assert.equal(baseline - scorerA.getScore('agent-x'), 20);
  assert.equal(baseline - scorerB.getScore('agent-x'), 15);
});

// ---------------------------------------------------------------------------
// Decay toward 500
// ---------------------------------------------------------------------------

test('score above 500 decays toward 500 over time', () => {
  const startMs = Date.now();
  // Agent with a high score, updated "now"
  const scorer = new TrustScorer(
    {
      'agent-d': {
        score: 600,
        observations: 50,
        updatedAt: new Date(startMs).toISOString(),
        createdAt: new Date(startMs).toISOString(),
      },
    },
    () => startMs + 100 * 24 * 60 * 60 * 1000 // advance 100 days
  );
  const decayed = scorer.getScore('agent-d');
  // 100 days * 1pt/day = 100 points decay from 600 → 500
  assert.equal(decayed, 500);
});

test('score below 500 decays toward 500 over time', () => {
  const startMs = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-e': {
        score: 400,
        observations: 50,
        updatedAt: new Date(startMs).toISOString(),
        createdAt: new Date(startMs).toISOString(),
      },
    },
    () => startMs + 100 * 24 * 60 * 60 * 1000 // advance 100 days
  );
  const decayed = scorer.getScore('agent-e');
  // 100 days * 1pt/day = 100 points decay from 400 → 500
  assert.equal(decayed, 500);
});

test('decay does not push score past 500 from above', () => {
  const startMs = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-f': {
        score: 510,
        observations: 50,
        updatedAt: new Date(startMs).toISOString(),
        createdAt: new Date(startMs).toISOString(),
      },
    },
    () => startMs + 1000 * 24 * 60 * 60 * 1000 // advance 1000 days
  );
  assert.equal(scorer.getScore('agent-f'), 500);
});

test('no decay within same instant (no time elapsed)', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-g': {
        score: 600,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now // same instant
  );
  assert.equal(scorer.getScore('agent-g'), 600);
});

// ---------------------------------------------------------------------------
// shouldAssignTask
// ---------------------------------------------------------------------------

test('shouldAssignTask returns true for default-score agent (no threshold)', () => {
  const scorer = makeScorer(Date.now());
  assert.equal(scorer.shouldAssignTask('unknown-agent'), true);
});

test('shouldAssignTask returns true when score >= threshold', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-h': {
        score: 700,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  assert.equal(scorer.shouldAssignTask('agent-h', 600), true);
});

test('shouldAssignTask uses 10% floor for low-trust agents (score at floor boundary)', () => {
  const now = Date.now();
  // Score of 100 = 10% of 1000 = exactly at the floor
  const scorer = new TrustScorer(
    {
      'agent-i': {
        score: 100,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  // Score 100/1000 = 0.10 >= LOW_TRUST_FLOOR (0.10), should return true
  assert.equal(scorer.shouldAssignTask('agent-i', 300), true);
});

test('shouldAssignTask returns false when agent score is below 10% floor', () => {
  const now = Date.now();
  // Score of 50 = 5% of 1000, below the 10% floor
  const scorer = new TrustScorer(
    {
      'agent-j': {
        score: 50,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  assert.equal(scorer.shouldAssignTask('agent-j', 300), false);
});

// ---------------------------------------------------------------------------
// selectBestAgent
// ---------------------------------------------------------------------------

test('selectBestAgent returns null for empty candidates', () => {
  const scorer = makeScorer(Date.now());
  assert.equal(scorer.selectBestAgent([]), null);
});

test('selectBestAgent returns the only candidate', () => {
  const scorer = makeScorer(Date.now());
  assert.equal(scorer.selectBestAgent(['agent-a']), 'agent-a');
});

test('selectBestAgent picks the highest-score candidate', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-low': {
        score: 300,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
      'agent-mid': {
        score: 500,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
      'agent-high': {
        score: 800,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  assert.equal(scorer.selectBestAgent(['agent-low', 'agent-mid', 'agent-high']), 'agent-high');
});

test('selectBestAgent uses SCORE_DEFAULT for unknown agents', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-known': {
        score: 400,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  // 'unknown-agent' defaults to 500, which beats 'agent-known' at 400
  assert.equal(scorer.selectBestAgent(['agent-known', 'unknown-agent']), 'unknown-agent');
});

test('selectBestAgent returns first when all scores are equal', () => {
  const scorer = makeScorer(Date.now());
  // All unknown agents default to 500
  assert.equal(scorer.selectBestAgent(['alpha', 'beta', 'gamma']), 'alpha');
});

// ---------------------------------------------------------------------------
// getAllScores
// ---------------------------------------------------------------------------

test('getAllScores returns empty object when no agents recorded', () => {
  const scorer = makeScorer(Date.now());
  assert.deepEqual(scorer.getAllScores(), {});
});

test('getAllScores includes all recorded agents', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  scorer.recordSuccess('agent-a');
  scorer.recordSuccess('agent-b');
  const all = scorer.getAllScores();
  assert.ok('agent-a' in all);
  assert.ok('agent-b' in all);
});

test('getAllScores entries include score, observations, updatedAt, createdAt', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  scorer.recordSuccess('agent-a');
  const entry = scorer.getAllScores()['agent-a'];
  assert.ok(typeof entry.score === 'number');
  assert.ok(typeof entry.observations === 'number');
  assert.ok(typeof entry.updatedAt === 'string');
  assert.ok(typeof entry.createdAt === 'string');
});

// ---------------------------------------------------------------------------
// toJSON
// ---------------------------------------------------------------------------

test('toJSON returns the same data as getAllScores', () => {
  const now = Date.now();
  const scorer = makeScorer(now);
  scorer.recordSuccess('agent-a');
  assert.deepEqual(scorer.toJSON(), scorer.getAllScores());
});

test('toJSON output can round-trip through TrustScorer constructor', () => {
  const now = Date.now();
  const scorer = new TrustScorer({}, () => now);
  // Seed enough observations to bump score
  for (let i = 0; i < MIN_OBSERVATIONS; i++) {
    scorer.recordSuccess('agent-a');
  }
  const snapshot = scorer.toJSON();
  const restored = new TrustScorer(snapshot, () => now);
  assert.equal(restored.getScore('agent-a'), scorer.getScore('agent-a'));
  assert.equal(
    restored.getAllScores()['agent-a'].observations,
    scorer.getAllScores()['agent-a'].observations
  );
});

// ---------------------------------------------------------------------------
// Edge cases / robustness
// ---------------------------------------------------------------------------

test('handles null/undefined agentType gracefully in all methods', () => {
  const scorer = makeScorer(Date.now());
  assert.doesNotThrow(() => scorer.recordSuccess(null));
  assert.doesNotThrow(() => scorer.recordGuardrailFailure(undefined));
  assert.doesNotThrow(() => scorer.recordLowReflectionScore(null));
  assert.equal(scorer.getScore(null), SCORE_DEFAULT);
  assert.equal(scorer.getScore(undefined), SCORE_DEFAULT);
  assert.equal(scorer.shouldAssignTask(null), true);
  assert.equal(scorer.selectBestAgent(null), null);
  assert.equal(scorer.selectBestAgent(undefined), null);
});

test('constructor ignores invalid initialState records', () => {
  const scorer = new TrustScorer({ 'agent-a': null, 'agent-b': 'bad', '': {} });
  // null and 'bad' are skipped; '' key is skipped too
  const all = scorer.getAllScores();
  // 'agent-b': 'bad' is not an object — should be skipped
  // 'agent-a': null — should be skipped
  assert.ok(!('agent-a' in all) || all['agent-a'].score === SCORE_DEFAULT);
});

test('score is clamped to 0-1000 range even with extreme initialState', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-extreme': {
        score: 9999,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  assert.equal(scorer.getScore('agent-extreme'), SCORE_MAX);
});

test('negative score in initialState clamped to SCORE_MIN', () => {
  const now = Date.now();
  const scorer = new TrustScorer(
    {
      'agent-neg': {
        score: -999,
        observations: 50,
        updatedAt: new Date(now).toISOString(),
        createdAt: new Date(now).toISOString(),
      },
    },
    () => now
  );
  assert.equal(scorer.getScore('agent-neg'), SCORE_MIN);
});
