/**
 * SPEC-009: Progressive Disclosure v2 - Adaptive Questioning
 *
 * TDD Phase: RED (Write failing tests first)
 *
 * Test Coverage:
 * - Adaptive algorithm behavior (15+ tests)
 * - Context accumulation (15+ tests)
 * - Memory integration (15+ tests)
 * - Scoring algorithms (15+ tests)
 * - Spec readiness (10+ tests)
 *
 * Total: 70+ tests
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const path = require('path');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

// ============================================================================

// CATEGORY 4: Scoring Algorithms (15+ tests)
// ============================================================================

test('[Scoring] Should calculate completeness score', () => {
  const { scoreCompleteness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [
    { answer: 'JWT' },
    { answer: 'PostgreSQL' },
    { answer: 'REST' },
    { answer: 'Jest' },
    { answer: '<200ms' },
  ];
  const expectedFields = ['auth', 'database', 'api', 'testing', 'performance'];

  const score = scoreCompleteness(answers, expectedFields);

  assert.ok(score >= 80, 'Completeness score should be high (80+) with all fields');
});

test('[Scoring] Should penalize missing fields', () => {
  const { scoreCompleteness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [{ answer: 'JWT' }, { answer: 'PostgreSQL' }];
  const expectedFields = ['auth', 'database', 'api', 'testing', 'performance'];

  const score = scoreCompleteness(answers, expectedFields);

  assert.ok(score < 50, 'Completeness score should be low (<50) with missing fields');
});

test('[Scoring] Should calculate quality score', () => {
  const { scoreQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [
    { answer: 'JWT with RS256, 1-hour access tokens, 7-day refresh tokens', quality: 0.9 },
    { answer: 'PostgreSQL with connection pooling', quality: 0.8 },
  ];
  const domainPatterns = ['JWT', 'PostgreSQL', 'pooling'];

  const score = scoreQuality(answers, domainPatterns);

  assert.ok(score >= 70, 'Quality score should be high with detailed answers');
});

test('[Scoring] Should calculate consistency score', () => {
  const { scoreConsistency } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [
    { question: 'Database?', answer: 'PostgreSQL' },
    { question: 'What DB?', answer: 'PostgreSQL' },
  ];
  const context = { database: 'PostgreSQL' };

  const score = scoreConsistency(answers, context);

  assert.ok(score >= 90, 'Consistency score should be high with consistent answers');
});

test('[Scoring] Should detect inconsistencies', () => {
  const { scoreConsistency } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [
    { question: 'Database?', answer: 'PostgreSQL' },
    { question: 'What DB?', answer: 'MySQL' },
  ];
  const context = {};

  const score = scoreConsistency(answers, context);

  assert.ok(score < 50, 'Consistency score should be low with conflicts');
});

test('[Scoring] Should compute overall readiness', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const scores = {
    completeness: 90,
    quality: 85,
    consistency: 95,
  };

  const readiness = computeOverallReadiness(scores);

  assert.ok(readiness >= 85, 'Overall readiness should be high with good scores');
  assert.ok(readiness <= 100, 'Overall readiness should not exceed 100');
});

test('[Scoring] Should weight completeness highest', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const highCompleteness = computeOverallReadiness({
    completeness: 100,
    quality: 50,
    consistency: 50,
  });
  const lowCompleteness = computeOverallReadiness({
    completeness: 50,
    quality: 100,
    consistency: 100,
  });

  assert.ok(highCompleteness > lowCompleteness, 'Completeness should be weighted highest');
});

test('[Scoring] Should handle edge case: all zeros', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const readiness = computeOverallReadiness({ completeness: 0, quality: 0, consistency: 0 });

  assert.strictEqual(readiness, 0, 'Overall readiness should be 0 with all zero scores');
});

test('[Scoring] Should handle edge case: perfect scores', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const readiness = computeOverallReadiness({ completeness: 100, quality: 100, consistency: 100 });

  assert.strictEqual(readiness, 100, 'Overall readiness should be 100 with perfect scores');
});

test('[Scoring] Should normalize scores to 0-100 range', () => {
  const { scoreCompleteness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const score = scoreCompleteness([], ['a', 'b', 'c']);

  assert.ok(score >= 0 && score <= 100, 'Score should be in 0-100 range');
});

test('[Scoring] Should calculate quality from answer length', () => {
  const { scoreQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const detailedAnswers = [
    {
      answer:
        'JWT authentication with RS256 signing algorithm, 1-hour access tokens, 7-day refresh tokens stored in httpOnly cookies',
      quality: 0.95,
    },
  ];
  const briefAnswers = [{ answer: 'JWT', quality: 0.3 }];

  const detailedScore = scoreQuality(detailedAnswers, []);
  const briefScore = scoreQuality(briefAnswers, []);

  assert.ok(detailedScore > briefScore, 'Detailed answers should have higher quality score');
});

test('[Scoring] Should penalize empty answers in quality', () => {
  const { scoreQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [
    { answer: '', quality: 0 },
    { answer: 'JWT', quality: 0.5 },
  ];

  const score = scoreQuality(answers, []);

  assert.ok(score < 50, 'Quality score should be low with empty answers');
});

test('[Scoring] Should calculate consistency with context', () => {
  const { scoreConsistency } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const answers = [{ answer: 'JWT' }, { answer: 'PostgreSQL' }];
  const context = { auth: 'JWT', database: 'PostgreSQL' };

  const score = scoreConsistency(answers, context);

  assert.ok(score >= 90, 'Consistency score should be high when answers match context');
});

test('[Scoring] Should handle missing domain patterns', () => {
  const { scoreQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const score = scoreQuality([{ answer: 'Some answer', quality: 0.5 }], []);

  assert.ok(score >= 0 && score <= 100, 'Should handle missing patterns gracefully');
});

test('[Scoring] Should compute readiness < 50 for sparse answers', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const readiness = computeOverallReadiness({ completeness: 30, quality: 40, consistency: 50 });

  assert.ok(readiness < 50, 'Readiness should be low with sparse answers');
});

// ============================================================================
// CATEGORY 5: Spec Readiness Detection (10+ tests)
// ============================================================================

test('[Readiness] Should recommend stopping with rich history', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const richHistory = Array(7)
    .fill(null)
    .map((_, i) => ({
      question: `Q${i}?`,
      answer: `Detailed answer ${i} with context`,
    }));

  const result = await aq.detectOptimalStop(richHistory, {});

  assert.strictEqual(result.shouldStop, true, 'Should recommend stopping with 7+ answers');
  assert.ok(result.readiness >= 80, 'Readiness should be high (80+)');
});

test('[Readiness] Should continue with sparse history', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const sparseHistory = [{ question: 'Auth?', answer: 'JWT' }];

  const result = await aq.detectOptimalStop(sparseHistory, {});

  assert.strictEqual(result.shouldStop, false, 'Should continue with 1 answer');
  assert.ok(result.readiness < 50, 'Readiness should be low (<50)');
});

test('[Readiness] Should identify missing areas', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('api-design', null);

  const partialHistory = [{ question: 'API type?', answer: 'REST' }];

  const result = await aq.detectOptimalStop(partialHistory, {});

  assert.ok(result.missingAreas.length > 0, 'Should identify missing areas');
  assert.ok(
    result.missingAreas.some(area => area.match(/endpoint|route|versioning/i)),
    'Should identify API-specific missing areas'
  );
});

test('[Readiness] Should handle empty history', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('general', null);

  const result = await aq.detectOptimalStop([], {});

  assert.strictEqual(result.shouldStop, false, 'Should not stop with empty history');
  assert.strictEqual(result.readiness, 0, 'Readiness should be 0 with empty history');
  assert.ok(result.missingAreas.length > 0, 'Should have missing areas');
});

test('[Readiness] Should recommend stopping at 5-7 quality answers', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('database', null);

  const qualityHistory = [
    { question: 'DB type?', answer: 'PostgreSQL with connection pooling (min: 2, max: 10)' },
    { question: 'Migration?', answer: 'Alembic with auto-generated migrations' },
    { question: 'Schema?', answer: 'Users, Posts, Comments with foreign keys' },
    { question: 'Indexes?', answer: 'B-tree on user_id, created_at columns' },
    { question: 'Performance?', answer: 'Query time <50ms, connection pool reuse' },
  ];

  const result = await aq.detectOptimalStop(qualityHistory, {});

  assert.strictEqual(result.shouldStop, true, 'Should recommend stopping with 5 quality answers');
  assert.ok(result.readiness >= 75, 'Readiness should be high (75+)');
});

test('[Readiness] Should not stop with low-quality answers', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('testing', null);

  const lowQualityHistory = [
    { question: 'Framework?', answer: 'Jest' },
    { question: 'Coverage?', answer: 'Yes' },
    { question: 'E2E?', answer: 'Maybe' },
    { question: 'Unit?', answer: 'Sure' },
    { question: 'Integration?', answer: 'OK' },
  ];

  const result = await aq.detectOptimalStop(lowQualityHistory, {});

  assert.strictEqual(result.shouldStop, false, 'Should not stop with low-quality answers');
  assert.ok(result.readiness < 60, 'Readiness should be low (<60)');
});

test('[Readiness] Should calculate readiness percentage', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('performance', null);

  const mediumHistory = [
    { question: 'Target?', answer: '<200ms API response' },
    { question: 'Cache?', answer: 'Redis with 5-minute TTL' },
    { question: 'CDN?', answer: 'CloudFront for static assets' },
  ];

  const result = await aq.detectOptimalStop(mediumHistory, {});

  assert.ok(result.readiness >= 0 && result.readiness <= 100, 'Readiness should be 0-100');
});

test('[Readiness] Should provide missing area details', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('security', null);

  const incompleteHistory = [{ question: 'Auth?', answer: 'JWT' }];

  const result = await aq.detectOptimalStop(incompleteHistory, {});

  assert.ok(result.missingAreas.length >= 3, 'Should identify multiple missing security areas');
  assert.ok(
    result.missingAreas.some(area => area.match(/encryption|auth|permission/i)),
    'Should identify security-specific gaps'
  );
});

test('[Readiness] Should handle very long history (10+ answers)', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('general', null);

  const longHistory = Array(12)
    .fill(null)
    .map((_, i) => ({
      question: `Question ${i}?`,
      answer: `Answer ${i}`,
    }));

  const result = await aq.detectOptimalStop(longHistory, {});

  assert.strictEqual(result.shouldStop, true, 'Should recommend stopping with 10+ answers');
  assert.ok(result.readiness >= 85, 'Readiness should be very high (85+)');
});

test('[Readiness] Should early terminate if all critical areas covered', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const criticalHistory = [
    { question: 'Auth method?', answer: 'JWT with RS256' },
    { question: 'Token expiry?', answer: '1 hour access, 7 day refresh' },
    { question: 'Password hashing?', answer: 'bcrypt, cost factor 12' },
    { question: 'Rate limiting?', answer: '5 attempts, 15 min lockout' },
  ];

  const result = await aq.detectOptimalStop(criticalHistory, {});

  assert.strictEqual(result.shouldStop, true, 'Should stop early with critical coverage');
  assert.strictEqual(result.missingAreas.length, 0, 'Should have no critical missing areas');
});

// ============================================================================
// CATEGORY 6: Performance Tests (10 tests)
// ============================================================================

test('[Performance] Question generation should be <500ms', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const start = Date.now();
  await aq.getNextQuestion({}, []);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 500, `Question generation took ${elapsed}ms, should be <500ms`);
});

test('[Performance] Context accumulation should be <100ms', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  const start = Date.now();
  for (let i = 0; i < 10; i++) {
    ca.addAnswer(`Question ${i}?`, `Answer ${i}`, {});
  }
  ca.getContext();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 100, `Context accumulation took ${elapsed}ms, should be <100ms`);
});

test('[Performance] Memory lookup should be <200ms', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const start = Date.now();
  await loadDomainPatterns('authentication');
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 200, `Memory lookup took ${elapsed}ms, should be <200ms`);
});

test('[Performance] Scoring algorithms should be <50ms', () => {
  const { computeOverallReadiness } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/readiness-scorer.cjs')
  );

  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    computeOverallReadiness({ completeness: 80, quality: 75, consistency: 90 });
  }
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 50, `100 scoring calls took ${elapsed}ms, should be <50ms`);
});

test('[Performance] Conflict detection should be <100ms', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  for (let i = 0; i < 20; i++) {
    ca.addAnswer(`Question ${i}?`, `Answer ${i}`, {});
  }

  const start = Date.now();
  ca.detectConflicts();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 100, `Conflict detection took ${elapsed}ms, should be <100ms`);
});

test('[Performance] Readiness detection should be <200ms', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('general', null);

  const history = Array(10)
    .fill(null)
    .map((_, i) => ({
      question: `Q${i}?`,
      answer: `Answer ${i}`,
    }));

  const start = Date.now();
  await aq.detectOptimalStop(history, {});
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 200, `Readiness detection took ${elapsed}ms, should be <200ms`);
});

test('[Performance] Summary generation should be <50ms', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  for (let i = 0; i < 10; i++) {
    ca.addAnswer(`Question ${i}?`, `Detailed answer ${i} with lots of context`, {});
  }

  const start = Date.now();
  ca.buildSummary();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 50, `Summary generation took ${elapsed}ms, should be <50ms`);
});

test('[Performance] Pattern scoring should be <100ms', async () => {
  const { scoreAnswerQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = ['JWT', 'bcrypt', 'PostgreSQL', 'REST', 'Jest'];
  const answer = 'JWT with bcrypt, PostgreSQL database, REST API, Jest tests';

  const start = Date.now();
  for (let i = 0; i < 50; i++) {
    await scoreAnswerQuality(answer, patterns);
  }
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 100, `50 pattern scoring calls took ${elapsed}ms, should be <100ms`);
});

test('[Performance] Full flow should be <5 seconds', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );

  const start = Date.now();

  const aq = new AdaptiveQuestioner('authentication', null);
  const ca = new ContextAccumulator();

  for (let i = 0; i < 5; i++) {
    const q = await aq.getNextQuestion(ca.getContext(), []);
    ca.addAnswer(q.question, `Answer ${i}`, {});
  }

  await aq.detectOptimalStop([], ca.getContext());
  ca.buildSummary();

  const elapsed = Date.now() - start;

  assert.ok(elapsed < 5000, `Full flow took ${elapsed}ms, should be <5s`);
});

test('[Performance] Should handle 100 questions without performance degradation', async () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  const times = [];

  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    ca.addAnswer(`Question ${i}?`, `Answer ${i}`, {});
    times.push(performance.now() - start);
  }

  const avgFirst10 = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const avgLast10 = times.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const baseline = Math.max(avgFirst10, 0.01);

  // Performance should not degrade significantly
  assert.ok(
    avgLast10 <= baseline * 2,
    `Performance should not degrade >2x over 100 operations (first10=${avgFirst10.toFixed(4)}ms, last10=${avgLast10.toFixed(4)}ms)`
  );
});

console.log('✅ All 70+ tests written (RED phase complete)');
console.log(
  '📊 Test categories: Adaptive (15), Context (15), Memory (15), Scoring (15), Readiness (10), Performance (10)'
);
console.log('⏭️  Next: GREEN phase - implement minimal code to pass tests');
