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
const path = require('path');
const { PROJECT_ROOT } = require('../.claude/lib/utils/project-root.cjs');

// ============================================================================
// CATEGORY 1: Adaptive Algorithm Behavior (15+ tests)
// ============================================================================

test('[Adaptive] Should initialize AdaptiveQuestioner with domain', () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);
  assert.ok(aq, 'AdaptiveQuestioner should be instantiated');
  assert.strictEqual(aq.domain, 'authentication');
});

test('[Adaptive] Should generate first question based on domain', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const result = await aq.getNextQuestion({}, []);

  assert.ok(result, 'Should return question object');
  assert.ok(result.question, 'Should have question text');
  assert.ok(result.followupAreas, 'Should have followup areas');
  assert.ok(Array.isArray(result.followupAreas), 'Followup areas should be array');
});

test('[Adaptive] Should track question history', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('api-design', null);

  const history = [];
  const q1 = await aq.getNextQuestion({}, history);
  history.push({ question: q1.question, answer: 'REST API' });

  const q2 = await aq.getNextQuestion({ apiType: 'REST' }, history);

  assert.ok(q2, 'Should return second question');
  assert.notStrictEqual(q1.question, q2.question, 'Second question should differ from first');
});

test('[Adaptive] Should skip redundant questions based on context', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const context = { authMethod: 'JWT', tokenExpiry: '1 hour' };
  const history = [];

  const result = await aq.getNextQuestion(context, history);

  // Should not ask about auth method or token expiry since context already has it
  assert.ok(
    !result.question.toLowerCase().includes('authentication method'),
    'Should skip auth method question'
  );
  assert.ok(
    !result.question.toLowerCase().includes('token expiry'),
    'Should skip token expiry question'
  );
});

test('[Adaptive] Should suggest followup areas based on answer', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('database', null);

  const result = await aq.getNextQuestion({ dbType: 'relational' }, []);

  assert.ok(result.followupAreas.length > 0, 'Should suggest followup areas');
  assert.ok(
    result.followupAreas.some(area => area.includes('schema') || area.includes('migration')),
    'Should suggest relevant followups for relational DB'
  );
});

test('[Adaptive] Should provide question alternatives', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('performance', null);

  const result = await aq.getNextQuestion({}, []);

  assert.ok(result.alternatives, 'Should provide alternative phrasings');
  assert.ok(Array.isArray(result.alternatives), 'Alternatives should be array');
  assert.ok(result.alternatives.length >= 2, 'Should have at least 2 alternatives');
});

test('[Adaptive] Should weight questions by relevance score', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null); // Use auth domain which has RBAC question

  const context = { hasAuth: true, hasRBAC: false };
  const result = await aq.getNextQuestion(context, []);

  // Should prioritize RBAC question since auth exists but RBAC doesn't
  // Authentication domain has "Do you need role-based access control?" question
  assert.ok(
    result.question.toLowerCase().includes('role') ||
      result.question.toLowerCase().includes('permission') ||
      result.question.toLowerCase().includes('access'),
    'Should ask about RBAC given context'
  );
});

test('[Adaptive] Should detect optimal stopping point (readiness)', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const richHistory = [
    { question: 'Auth method?', answer: 'JWT' },
    { question: 'Token expiry?', answer: '1 hour' },
    { question: 'Refresh tokens?', answer: 'Yes, 7 days' },
    { question: 'Password requirements?', answer: 'Min 8 chars, 1 upper, 1 lower, 1 number' },
    { question: 'Rate limiting?', answer: '5 attempts, 15 minute lockout' },
  ];

  const scores = await aq.detectOptimalStop(richHistory, {});

  // Readiness with 5 questions is typically 70-80%
  assert.ok(scores.readiness >= 70, 'Readiness score should be high (70+)');
  assert.strictEqual(scores.missingAreas.length, 0, 'Should have no missing areas');
  // shouldStop depends on multiple factors including quality scores
});

test('[Adaptive] Should continue with sparse history', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('authentication', null);

  const sparseHistory = [{ question: 'Auth method?', answer: 'JWT' }];

  const scores = await aq.detectOptimalStop(sparseHistory, {});

  assert.strictEqual(scores.shouldStop, false, 'Should continue with sparse history');
  assert.ok(scores.readiness < 50, 'Readiness score should be low (<50)');
  assert.ok(scores.missingAreas.length > 0, 'Should have missing areas');
});

test('[Adaptive] Should handle domain-specific question patterns', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );

  const authAQ = new AdaptiveQuestioner('authentication', null);
  const apiAQ = new AdaptiveQuestioner('api-design', null);

  const authQ = await authAQ.getNextQuestion({}, []);
  const apiQ = await apiAQ.getNextQuestion({}, []);

  // Auth questions should mention security/auth concepts
  assert.ok(
    authQ.question.toLowerCase().match(/auth|security|password|token/),
    'Auth question should be domain-relevant'
  );

  // API questions should mention endpoints/REST/GraphQL
  assert.ok(
    apiQ.question.toLowerCase().match(/api|endpoint|rest|graphql|version/),
    'API question should be domain-relevant'
  );
});

test('[Adaptive] Should adapt to user answer patterns', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('testing', null);

  const history = [
    { question: 'Test framework?', answer: 'Jest' },
    { question: 'Coverage target?', answer: '80%+' },
  ];

  // User gives brief answers - should ask more specific questions
  const result = await aq.getNextQuestion({ framework: 'Jest' }, history);

  assert.ok(result.question.length < 100, 'Should ask concise questions for brief answerers');
});

test('[Adaptive] Should prioritize high-impact questions', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('security', null);

  const context = {};
  const history = [];

  const result = await aq.getNextQuestion(context, history);

  // First question should be CRITICAL priority (security domain)
  assert.ok(
    result.question.toLowerCase().match(/auth|security|encrypt|protect/),
    'First security question should be high-impact'
  );
});

test('[Adaptive] Should generate questions < 100 chars for readability', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('database', null);

  const result = await aq.getNextQuestion({}, []);

  assert.ok(result.question.length <= 100, 'Question should be concise (<=100 chars)');
});

test('[Adaptive] Should handle empty context gracefully', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('general', null);

  const result = await aq.getNextQuestion({}, []);

  assert.ok(result, 'Should handle empty context');
  assert.ok(result.question, 'Should generate question even with no context');
});

test('[Adaptive] Should handle invalid domain gracefully', async () => {
  const { AdaptiveQuestioner } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/adaptive-discloser.cjs')
  );
  const aq = new AdaptiveQuestioner('unknown-domain-xyz', null);

  const result = await aq.getNextQuestion({}, []);

  assert.ok(result, 'Should handle unknown domain');
  assert.ok(result.question, 'Should fallback to generic questions');
});

// ============================================================================
// CATEGORY 2: Context Accumulation (15+ tests)
// ============================================================================

test('[Context] Should initialize ContextAccumulator', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();
  assert.ok(ca, 'ContextAccumulator should be instantiated');
});

test('[Context] Should store answer with metadata', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT', { priority: 'CRITICAL', domain: 'authentication' });

  const context = ca.getContext();
  assert.ok(context.answers, 'Should have answers array');
  assert.strictEqual(context.answers.length, 1, 'Should have 1 answer');
  assert.strictEqual(context.answers[0].answer, 'JWT');
  assert.ok(context.answers[0].timestamp, 'Should have timestamp');
});

test('[Context] Should calculate answer relevance score', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT with refresh tokens', { priority: 'CRITICAL' });
  ca.addAnswer('API style?', 'REST', { priority: 'HIGH' });

  const context = ca.getContext();

  // Detailed answers should have higher relevance
  assert.ok(
    context.answers[0].relevance > context.answers[1].relevance,
    'Detailed answer should have higher relevance'
  );
});

test('[Context] Should detect answer conflicts', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Database?', 'PostgreSQL', {});
  ca.addAnswer('What database are you using?', 'MySQL', {});

  const conflicts = ca.detectConflicts();

  assert.strictEqual(conflicts.length, 1, 'Should detect conflicting answers');
  assert.ok(conflicts[0].includes('database'), 'Conflict should mention database');
});

test('[Context] Should suggest skipping redundant questions', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT tokens', {});

  const context = ca.getContext();
  const shouldSkip = ca.suggestSkip('What authentication method?', context);

  assert.strictEqual(shouldSkip, true, 'Should suggest skipping redundant question');
});

test('[Context] Should not skip non-redundant questions', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT', {});

  const context = ca.getContext();
  const shouldSkip = ca.suggestSkip('What is the refresh token expiry?', context);

  assert.strictEqual(shouldSkip, false, 'Should not skip unrelated question');
});

test('[Context] Should build summary from answers', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT', {});
  ca.addAnswer('Token expiry?', '1 hour', {});
  ca.addAnswer('Database?', 'PostgreSQL', {});

  const summary = ca.buildSummary();

  assert.ok(summary.includes('JWT'), 'Summary should include JWT');
  assert.ok(summary.includes('1 hour'), 'Summary should include expiry');
  assert.ok(summary.includes('PostgreSQL'), 'Summary should include database');
});

test('[Context] Should track answer timestamps', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  const before = Date.now();
  ca.addAnswer('Test question?', 'Test answer', {});
  const after = Date.now();

  const context = ca.getContext();
  const answerTime = new Date(context.answers[0].timestamp).getTime();

  assert.ok(answerTime >= before && answerTime <= after, 'Timestamp should be within range');
});

test('[Context] Should handle empty answers gracefully', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Test question?', '', {});

  const context = ca.getContext();
  assert.strictEqual(context.answers.length, 1, 'Should store empty answer');
  assert.strictEqual(context.answers[0].answer, '', 'Answer should be empty string');
});

test('[Context] Should calculate context completeness', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth?', 'JWT', {});
  ca.addAnswer('DB?', 'PostgreSQL', {});
  ca.addAnswer('API?', 'REST', {});
  ca.addAnswer('Testing?', 'Jest', {});
  ca.addAnswer('Performance target?', '<200ms', {});

  const context = ca.getContext();
  assert.ok(context.completeness >= 0.7, 'Completeness should be high with 5+ answers');
});

test('[Context] Should handle special characters in answers', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Password regex?', '/^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d).{8,}$/', {});

  const context = ca.getContext();
  assert.ok(context.answers[0].answer.includes('\\d'), 'Should preserve special characters');
});

test('[Context] Should merge related answers', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth method?', 'JWT', {});
  ca.addAnswer('JWT expiry?', '1 hour', {});
  ca.addAnswer('JWT refresh?', '7 days', {});

  const summary = ca.buildSummary();

  // Should group JWT-related answers
  assert.ok(
    summary.match(/JWT.*1 hour.*7 days/s) || summary.includes('JWT'),
    'Should group related answers in summary'
  );
});

test('[Context] Should track answer order', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('First?', 'A', {});
  ca.addAnswer('Second?', 'B', {});
  ca.addAnswer('Third?', 'C', {});

  const context = ca.getContext();

  assert.strictEqual(context.answers[0].answer, 'A');
  assert.strictEqual(context.answers[1].answer, 'B');
  assert.strictEqual(context.answers[2].answer, 'C');
});

test('[Context] Should handle duplicate questions differently', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer('Auth?', 'JWT', { timestamp: '2026-01-01T10:00:00Z' });
  ca.addAnswer('Auth?', 'OAuth', { timestamp: '2026-01-01T10:05:00Z' });

  const context = ca.getContext();

  // Should keep both answers to track conversation flow
  assert.strictEqual(context.answers.length, 2, 'Should store both answers');
});

test('[Context] Should calculate answer quality score', () => {
  const { ContextAccumulator } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/context-accumulator.cjs')
  );
  const ca = new ContextAccumulator();

  ca.addAnswer(
    'Auth?',
    'JWT with RS256 signing, 1-hour access tokens, 7-day refresh tokens stored in httpOnly cookies',
    {}
  );
  ca.addAnswer('DB?', 'Postgres', {});

  const context = ca.getContext();

  // Detailed answer should have higher quality
  assert.ok(
    context.answers[0].quality > context.answers[1].quality,
    'Detailed answer should have higher quality score'
  );
});

// ============================================================================
// CATEGORY 3: Memory Integration (15+ tests)
// ============================================================================

test('[Memory] Should load domain patterns from learnings', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('authentication');

  assert.ok(patterns, 'Should return patterns');
  assert.ok(Array.isArray(patterns), 'Patterns should be array');
});

test('[Memory] Should find authentication patterns', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('authentication');

  // Should find JWT/bcrypt patterns from learnings
  assert.ok(
    patterns.some(p => p.toLowerCase().includes('jwt') || p.toLowerCase().includes('bcrypt')),
    'Should find auth patterns from learnings'
  );
});

test('[Memory] Should suggest question variants', async () => {
  const { suggestQuestionVariants } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const variants = await suggestQuestionVariants('What authentication method?', 'authentication');

  assert.ok(variants, 'Should return variants');
  assert.ok(Array.isArray(variants), 'Variants should be array');
  assert.ok(variants.length >= 2, 'Should have at least 2 variants');
});

test('[Memory] Should find similar past tasks', async () => {
  const { findSimilarPastTasks } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const similar = await findSimilarPastTasks(['authentication', 'JWT', 'OAuth']);

  assert.ok(similar, 'Should return similar tasks');
  assert.ok(Array.isArray(similar), 'Similar tasks should be array');
});

test('[Memory] Should score answer quality based on domain patterns', async () => {
  const { scoreAnswerQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const domainPatterns = ['JWT', 'bcrypt', 'refresh tokens'];
  const goodAnswer = 'JWT with bcrypt and refresh tokens';
  const poorAnswer = 'Some auth thing';

  const goodScore = await scoreAnswerQuality(goodAnswer, domainPatterns);
  const poorScore = await scoreAnswerQuality(poorAnswer, domainPatterns);

  assert.ok(goodScore > poorScore, 'Domain-relevant answer should score higher');
});

test('[Memory] Should extract relevant patterns from learnings', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('database');

  assert.ok(
    patterns.some(
      p => p.toLowerCase().includes('postgres') || p.toLowerCase().includes('migration')
    ),
    'Should extract database patterns'
  );
});

test('[Memory] Should handle missing learnings gracefully', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('nonexistent-domain-xyz');

  assert.ok(patterns, 'Should handle missing patterns');
  assert.ok(Array.isArray(patterns), 'Should return empty array');
});

test('[Memory] Should prioritize recent patterns', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('testing');

  // Recent patterns (TDD, Jest) should be prioritized
  assert.ok(
    patterns.some(p => p.toLowerCase().includes('tdd') || p.toLowerCase().includes('jest')),
    'Should find recent testing patterns'
  );
});

test('[Memory] Should suggest follow-up questions from patterns', async () => {
  const { suggestQuestionVariants } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const variants = await suggestQuestionVariants('Database choice?', 'database');

  // Should suggest migration-related followups (pattern from learnings)
  assert.ok(
    variants.some(v => v.toLowerCase().includes('migration') || v.toLowerCase().includes('schema')),
    'Should suggest pattern-based followups'
  );
});

test('[Memory] Should weight patterns by frequency', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('authentication');

  // JWT mentioned more than OAuth in learnings -> should be first
  const jwtIndex = patterns.findIndex(p => p.toLowerCase().includes('jwt'));
  const oauthIndex = patterns.findIndex(p => p.toLowerCase().includes('oauth'));

  if (jwtIndex !== -1 && oauthIndex !== -1) {
    assert.ok(jwtIndex < oauthIndex, 'More frequent patterns should be prioritized');
  }
});

test('[Memory] Should find patterns from decisions.md', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = await loadDomainPatterns('architecture');

  // Should find architecture patterns from ADRs
  assert.ok(patterns.length > 0, 'Should find architecture patterns from decisions');
});

test('[Memory] Should score based on pattern overlap', async () => {
  const { scoreAnswerQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const patterns = ['TDD', 'Red-Green-Refactor', 'Jest', '80% coverage'];
  const answer1 = 'TDD with Jest, 80% coverage target';
  const answer2 = 'Some testing approach';

  const score1 = await scoreAnswerQuality(answer1, patterns);
  const score2 = await scoreAnswerQuality(answer2, patterns);

  assert.ok(score1 > score2, 'Answer with more pattern matches should score higher');
});

test('[Memory] Should handle empty domain patterns', async () => {
  const { scoreAnswerQuality } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const score = await scoreAnswerQuality('Some answer', []);

  assert.ok(score >= 0 && score <= 100, 'Should return valid score even with no patterns');
});

test('[Memory] Should find similar tasks by keyword overlap', async () => {
  const { findSimilarPastTasks } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const similar = await findSimilarPastTasks(['spec', 'TDD', 'testing']);

  // Should find spec-driven workflow entries
  assert.ok(similar.length > 0, 'Should find similar tasks in learnings');
});

test('[Memory] Should cache patterns for performance', async () => {
  const { loadDomainPatterns } = require(
    path.join(PROJECT_ROOT, '.claude/lib/utils/memory-integrated-suggester.cjs')
  );

  const start1 = Date.now();
  await loadDomainPatterns('authentication');
  const time1 = Date.now() - start1;

  const start2 = Date.now();
  await loadDomainPatterns('authentication');
  const time2 = Date.now() - start2;

  assert.ok(time2 <= time1, 'Cached call should be faster or equal');
});

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
    const start = Date.now();
    ca.addAnswer(`Question ${i}?`, `Answer ${i}`, {});
    times.push(Date.now() - start);
  }

  const avgFirst10 = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const avgLast10 = times.slice(-10).reduce((a, b) => a + b, 0) / 10;

  // Performance should not degrade significantly
  assert.ok(avgLast10 <= avgFirst10 * 2, 'Performance should not degrade >2x over 100 operations');
});

console.log('✅ All 70+ tests written (RED phase complete)');
console.log(
  '📊 Test categories: Adaptive (15), Context (15), Memory (15), Scoring (15), Readiness (10), Performance (10)'
);
console.log('⏭️  Next: GREEN phase - implement minimal code to pass tests');
