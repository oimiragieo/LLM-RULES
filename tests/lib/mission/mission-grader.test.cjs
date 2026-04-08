'use strict';
/* eslint-disable max-lines */

/**
 * Tests for Mission Grader — Rule Evaluator Engine
 *
 * Covers: all 12+ evaluation kinds, scoring normalization,
 * blocker auto-fail, grade bands, full feature grading, edge cases.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  MissionGrader,
  resolvePointer,
  evaluateKind,
  isRuleApplicable,
  computeScore,
  getGradeBand,
  getPointsForRule,
} = require('../../../.claude/lib/mission/mission-grader.cjs');

// ---------------------------------------------------------------------------
// Helpers: minimal rubric and rules for unit tests
// ---------------------------------------------------------------------------

const MINIMAL_RUBRIC = {
  scale: {
    minScore: 0,
    maxScore: 100,
    passThreshold: 80,
    excellentThreshold: 92,
    marginalBand: [70, 79],
  },
  gradeBands: [
    { band: 'excellent', minScore: 92, maxScore: 100 },
    { band: 'good', minScore: 80, maxScore: 91 },
    { band: 'marginal', minScore: 70, maxScore: 79 },
    { band: 'fail', minScore: 0, maxScore: 69 },
  ],
  severityWeights: {
    blocker: { maxPoints: 0, failRun: true },
    major: { maxPoints: 12, failRun: false },
    minor: { maxPoints: 4, failRun: false },
    info: { maxPoints: 2, failRun: false },
    warning: { maxPoints: 0, failRun: false },
  },
  ruleScoring: {
    method: 'normalized_by_category',
    categoryCaps: {
      schema: 20,
      feature_spec: 15,
      traceability: 20,
      verification_evidence: 25,
      skill_compliance: 10,
      consistency: 15,
      dependency: 5,
      policy: 5,
      milestone: 5,
    },
    defaultRulePoints: { blocker: 15, major: 8, minor: 3, info: 1, warning: 0 },
    ruleOverrides: [{ ruleId: 'R-CUSTOM', pointsIfPass: 12 }],
  },
};

function makeFeature(overrides = {}) {
  return {
    id: 'test-feature',
    description: 'A test feature',
    skillName: 'test-worker',
    preconditions: ['setup completed'],
    expectedBehavior: ['Does something'],
    verificationSteps: ['npm test'],
    fulfills: ['VAL-TEST-001'],
    milestone: 'test-milestone',
    status: 'completed',
    ...overrides,
  };
}

function makeHandoff(overrides = {}) {
  return {
    timestamp: '2026-04-07T12:00:00Z',
    workerSessionId: '00000000-0000-0000-0000-000000000001',
    featureId: 'test-feature',
    milestone: 'test-milestone',
    commitId: 'abc1234',
    successState: 'success',
    returnToOrchestrator: false,
    handoff: {
      salientSummary: 'Implemented the test feature',
      whatWasImplemented: 'Full implementation',
      whatWasLeftUndone: 'Nothing',
      verification: {
        commandsRun: [{ command: 'npm test', exitCode: 0, observation: 'All pass' }],
      },
      tests: { added: ['test.js'], coverage: '95%' },
      discoveredIssues: [],
      skillFeedback: {
        followedProcedure: true,
        deviations: [],
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JSON Pointer
// ---------------------------------------------------------------------------

describe('resolvePointer', () => {
  it('resolves root pointer', () => {
    const obj = { a: 1 };
    assert.deepStrictEqual(resolvePointer(obj, ''), obj);
  });

  it('resolves nested pointer', () => {
    const obj = { a: { b: { c: 42 } } };
    assert.equal(resolvePointer(obj, '/a/b/c'), 42);
  });

  it('handles missing keys gracefully', () => {
    assert.equal(resolvePointer({ a: 1 }, '/b'), undefined);
  });

  it('handles tilde escapes', () => {
    const obj = { 'a/b': { '~c': 'found' } };
    assert.equal(resolvePointer(obj, '/a~1b/~0c'), 'found');
  });
});

// ---------------------------------------------------------------------------
// Evaluation kinds
// ---------------------------------------------------------------------------

describe('array_nonempty', () => {
  it('passes for non-empty array', () => {
    const r = evaluateKind(
      { kind: 'array_nonempty', artifact: 'feature', pointer: '/items' },
      { items: [1, 2] },
      { feature: { items: [1, 2] } },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails for empty array', () => {
    const r = evaluateKind(
      { kind: 'array_nonempty', artifact: 'feature', pointer: '/items' },
      { items: [] },
      { feature: { items: [] } },
      '.'
    );
    assert.equal(r.pass, false);
  });

  it('fails for non-array', () => {
    const r = evaluateKind(
      { kind: 'array_nonempty', artifact: 'feature', pointer: '/items' },
      { items: 'nope' },
      { feature: { items: 'nope' } },
      '.'
    );
    assert.equal(r.pass, false);
  });
});

describe('string_nonempty', () => {
  it('passes for non-empty string', () => {
    const r = evaluateKind(
      { kind: 'string_nonempty', artifact: 'feature', pointer: '/name' },
      { name: 'hello' },
      { feature: { name: 'hello' } },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails for whitespace-only', () => {
    const r = evaluateKind(
      { kind: 'string_nonempty', artifact: 'feature', pointer: '/name' },
      { name: '   ' },
      { feature: { name: '   ' } },
      '.'
    );
    assert.equal(r.pass, false);
  });
});

describe('set_subset', () => {
  it('passes when all left items are keys of right', () => {
    const r = evaluateKind(
      {
        kind: 'set_subset',
        left: { artifact: 'feature', pointer: '/ids' },
        right: { artifact: 'validationState', pointer: '/assertions', asKeys: true },
      },
      {},
      {
        feature: { ids: ['VAL-A-001', 'VAL-A-002'] },
        validationState: { assertions: { 'VAL-A-001': {}, 'VAL-A-002': {}, 'VAL-A-003': {} } },
      },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when some left items missing from right', () => {
    const r = evaluateKind(
      {
        kind: 'set_subset',
        left: { artifact: 'feature', pointer: '/ids' },
        right: { artifact: 'validationState', pointer: '/assertions', asKeys: true },
      },
      {},
      {
        feature: { ids: ['VAL-A-001', 'VAL-MISSING-999'] },
        validationState: { assertions: { 'VAL-A-001': {} } },
      },
      '.'
    );
    assert.equal(r.pass, false);
    assert.ok(r.evidence.includes('VAL-MISSING-999'));
  });
});

describe('regex_all_match', () => {
  it('passes when all match', () => {
    const r = evaluateKind(
      {
        kind: 'regex_all_match',
        artifact: 'feature',
        pointer: '/fulfills',
        regex: '^VAL-[A-Z0-9]+-[0-9]{3}$',
      },
      {},
      { feature: { fulfills: ['VAL-TEST-001', 'VAL-TEST-002'] } },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when some do not match', () => {
    const r = evaluateKind(
      {
        kind: 'regex_all_match',
        artifact: 'feature',
        pointer: '/fulfills',
        regex: '^VAL-[A-Z0-9]+-[0-9]{3}$',
      },
      {},
      { feature: { fulfills: ['VAL-TEST-001', 'bad-format'] } },
      '.'
    );
    assert.equal(r.pass, false);
  });
});

describe('markdown_contains_all', () => {
  it('passes when all needles found', () => {
    const r = evaluateKind(
      {
        kind: 'markdown_contains_all',
        artifact: 'validationContract',
        needlesFrom: { artifact: 'feature', pointer: '/fulfills' },
      },
      {},
      {
        feature: { fulfills: ['VAL-TEST-001'] },
        validationContract: '### VAL-TEST-001: Some assertion\nDetails here.',
      },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when needle missing', () => {
    const r = evaluateKind(
      {
        kind: 'markdown_contains_all',
        artifact: 'validationContract',
        needlesFrom: { artifact: 'feature', pointer: '/fulfills' },
      },
      {},
      {
        feature: { fulfills: ['VAL-MISSING-999'] },
        validationContract: 'No matching IDs here.',
      },
      '.'
    );
    assert.equal(r.pass, false);
  });
});

describe('verification_steps_covered', () => {
  it('passes when all steps have matching commands', () => {
    const r = evaluateKind(
      {
        kind: 'verification_steps_covered',
        featurePointer: '/verificationSteps',
        handoffPointer: '/handoff/verification/commandsRun',
      },
      { verificationSteps: ['npm test', 'npm run lint'] },
      {
        handoff: {
          handoff: {
            verification: {
              commandsRun: [
                { command: 'npm test -- --coverage', exitCode: 0 },
                { command: 'npm run lint', exitCode: 0 },
              ],
            },
          },
        },
      },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when step not covered', () => {
    const r = evaluateKind(
      {
        kind: 'verification_steps_covered',
        featurePointer: '/verificationSteps',
        handoffPointer: '/handoff/verification/commandsRun',
      },
      { verificationSteps: ['npm test', 'npm run lint'] },
      {
        handoff: {
          handoff: {
            verification: {
              commandsRun: [{ command: 'npm test', exitCode: 0 }],
            },
          },
        },
      },
      '.'
    );
    assert.equal(r.pass, false);
    assert.ok(r.evidence.includes('npm run lint'));
  });

  it('returns na for empty steps', () => {
    const r = evaluateKind(
      {
        kind: 'verification_steps_covered',
        featurePointer: '/verificationSteps',
        handoffPointer: '/handoff/verification/commandsRun',
      },
      { verificationSteps: [] },
      { handoff: {} },
      '.'
    );
    assert.equal(r.outcome, 'na');
  });
});

describe('object_keys_exist', () => {
  it('passes when all keys present', () => {
    const r = evaluateKind(
      {
        kind: 'object_keys_exist',
        artifact: 'handoff',
        pointer: '/sf',
        requiredKeys: ['followedProcedure', 'deviations'],
      },
      {},
      { handoff: { sf: { followedProcedure: true, deviations: [] } } },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when key missing', () => {
    const r = evaluateKind(
      {
        kind: 'object_keys_exist',
        artifact: 'handoff',
        pointer: '/sf',
        requiredKeys: ['followedProcedure', 'deviations'],
      },
      {},
      { handoff: { sf: { followedProcedure: true } } },
      '.'
    );
    assert.equal(r.pass, false);
  });
});

describe('equals', () => {
  it('passes for matching values', () => {
    const r = evaluateKind(
      {
        kind: 'equals',
        left: { artifact: 'handoff', pointer: '/featureId' },
        right: { artifact: 'feature', pointer: '/id' },
      },
      {},
      { handoff: { featureId: 'abc' }, feature: { id: 'abc' } },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails for mismatched values', () => {
    const r = evaluateKind(
      {
        kind: 'equals',
        left: { artifact: 'handoff', pointer: '/featureId' },
        right: { artifact: 'feature', pointer: '/id' },
      },
      {},
      { handoff: { featureId: 'abc' }, feature: { id: 'xyz' } },
      '.'
    );
    assert.equal(r.pass, false);
  });

  it('supports literal values', () => {
    const r = evaluateKind(
      {
        kind: 'equals',
        left: { artifact: 'handoff', pointer: '/returnToOrchestrator' },
        right: { literal: true },
      },
      {},
      { handoff: { returnToOrchestrator: true } },
      '.'
    );
    assert.equal(r.pass, true);
  });
});

describe('conditional_integrity', () => {
  it('returns na when condition not met', () => {
    const r = evaluateKind(
      {
        kind: 'conditional_integrity',
        when: { pointer: '/successState', equals: 'success' },
        then: { kind: 'all_commands_exit_zero', pointer: '/handoff/verification/commandsRun' },
      },
      {},
      { handoff: { successState: 'failure', handoff: { verification: { commandsRun: [] } } } },
      '.'
    );
    assert.equal(r.outcome, 'na');
  });

  it('passes when condition met and then satisfied', () => {
    const r = evaluateKind(
      {
        kind: 'conditional_integrity',
        when: { pointer: '/successState', equals: 'success' },
        then: { kind: 'all_commands_exit_zero', pointer: '/handoff/verification/commandsRun' },
      },
      {},
      {
        handoff: {
          successState: 'success',
          handoff: { verification: { commandsRun: [{ command: 'test', exitCode: 0 }] } },
        },
      },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('passes non-zero exits when discoveredIssues explains', () => {
    const r = evaluateKind(
      {
        kind: 'conditional_integrity',
        when: { pointer: '/successState', equals: 'success' },
        then: { kind: 'all_commands_exit_zero', pointer: '/handoff/verification/commandsRun' },
      },
      {},
      {
        handoff: {
          successState: 'success',
          handoff: {
            verification: { commandsRun: [{ command: 'test', exitCode: 1 }] },
            discoveredIssues: [{ severity: 'non_blocking', description: 'flaky test' }],
          },
        },
      },
      '.'
    );
    assert.equal(r.pass, true);
  });
});

describe('consistency_warning', () => {
  it('emits warning when feature completed but VAL pending', () => {
    const r = evaluateKind(
      {
        kind: 'consistency_warning',
        when: {
          all: [
            { feature: '/status', equals: 'completed' },
            { feature: '/fulfills', exists: true },
          ],
        },
        warnIf: { anyFulfills: { inValidationState: '/assertions', statusNot: 'passed' } },
        message: 'VAL not closed',
      },
      {},
      {
        feature: { status: 'completed', fulfills: ['VAL-A-001'] },
        validationState: { assertions: { 'VAL-A-001': { status: 'pending' } } },
      },
      '.'
    );
    assert.equal(r.pass, true);
    assert.equal(r.warning, true);
  });

  it('no warning when all assertions passed', () => {
    const r = evaluateKind(
      {
        kind: 'consistency_warning',
        when: {
          all: [
            { feature: '/status', equals: 'completed' },
            { feature: '/fulfills', exists: true },
          ],
        },
        warnIf: { anyFulfills: { inValidationState: '/assertions', statusNot: 'passed' } },
        message: 'VAL not closed',
      },
      {},
      {
        feature: { status: 'completed', fulfills: ['VAL-A-001'] },
        validationState: { assertions: { 'VAL-A-001': { status: 'passed' } } },
      },
      '.'
    );
    assert.equal(r.pass, true);
    assert.equal(r.warning, undefined);
  });
});

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

describe('isRuleApplicable', () => {
  it('returns true when no appliesWhen', () => {
    assert.equal(isRuleApplicable({ id: 'R-TEST' }, {}), true);
  });

  it('checks exists condition', () => {
    assert.equal(
      isRuleApplicable(
        { appliesWhen: { feature: '/fulfills', exists: true } },
        { feature: { fulfills: ['VAL-A-001'] } }
      ),
      true
    );
    assert.equal(
      isRuleApplicable({ appliesWhen: { feature: '/fulfills', exists: true } }, { feature: {} }),
      false
    );
  });

  it('checks arrayMinLength condition', () => {
    assert.equal(
      isRuleApplicable(
        { appliesWhen: { feature: '/verificationSteps', arrayMinLength: 1 } },
        { feature: { verificationSteps: ['test'] } }
      ),
      true
    );
    assert.equal(
      isRuleApplicable(
        { appliesWhen: { feature: '/verificationSteps', arrayMinLength: 1 } },
        { feature: { verificationSteps: [] } }
      ),
      false
    );
  });

  it('checks regex condition', () => {
    assert.equal(
      isRuleApplicable(
        { appliesWhen: { feature: '/id', regex: '(scrutiny-validator-)' } },
        { feature: { id: 'scrutiny-validator-memory' } }
      ),
      true
    );
    assert.equal(
      isRuleApplicable(
        { appliesWhen: { feature: '/id', regex: '(scrutiny-validator-)' } },
        { feature: { id: 'fts5-search' } }
      ),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe('getPointsForRule', () => {
  it('returns override points when available', () => {
    assert.equal(getPointsForRule('R-CUSTOM', 'major', MINIMAL_RUBRIC), 12);
  });

  it('returns default points when no override', () => {
    assert.equal(getPointsForRule('R-UNKNOWN', 'major', MINIMAL_RUBRIC), 8);
    assert.equal(getPointsForRule('R-UNKNOWN', 'blocker', MINIMAL_RUBRIC), 15);
    assert.equal(getPointsForRule('R-UNKNOWN', 'minor', MINIMAL_RUBRIC), 3);
  });
});

describe('getGradeBand', () => {
  it('returns correct bands', () => {
    assert.equal(getGradeBand(95, MINIMAL_RUBRIC), 'excellent');
    assert.equal(getGradeBand(85, MINIMAL_RUBRIC), 'good');
    assert.equal(getGradeBand(75, MINIMAL_RUBRIC), 'marginal');
    assert.equal(getGradeBand(50, MINIMAL_RUBRIC), 'fail');
    assert.equal(getGradeBand(0, MINIMAL_RUBRIC), 'fail');
  });
});

describe('computeScore', () => {
  it('normalizes by category caps', () => {
    const results = [
      { outcome: 'pass', pointsAwarded: 100, category: 'schema' },
      { outcome: 'pass', pointsAwarded: 10, category: 'traceability' },
    ];
    const score = computeScore(results, MINIMAL_RUBRIC);
    // schema capped at 20, traceability at 10 → 30 of 120 total → 25
    assert.equal(score, 25);
  });

  it('returns 0 for empty results', () => {
    assert.equal(computeScore([], MINIMAL_RUBRIC), 0);
  });
});

// ---------------------------------------------------------------------------
// Full gradeFeature
// ---------------------------------------------------------------------------

describe('MissionGrader.gradeFeature', () => {
  let grader;

  beforeEach(() => {
    grader = new MissionGrader({
      rules: [
        {
          id: 'R-FEATURE-ID-MATCH-HANDOFF',
          title: 'IDs match',
          category: 'consistency',
          severity: 'blocker',
          evaluation: {
            kind: 'equals',
            left: { artifact: 'handoff', pointer: '/featureId' },
            right: { artifact: 'feature', pointer: '/id' },
          },
        },
        {
          id: 'R-SKILL-FEEDBACK-PRESENT',
          title: 'Skill feedback present',
          category: 'skill_compliance',
          severity: 'minor',
          evaluation: {
            kind: 'object_keys_exist',
            artifact: 'handoff',
            pointer: '/handoff/skillFeedback',
            requiredKeys: ['followedProcedure', 'deviations'],
          },
        },
      ],
      rubric: MINIMAL_RUBRIC,
    });
  });

  it('produces a valid grading report for passing feature', () => {
    const feature = makeFeature();
    const handoff = makeHandoff();

    const report = grader.gradeFeature(feature, handoff, {});
    assert.equal(report.specVersion, '1.0.0');
    assert.ok(report.gradedAt);
    assert.equal(typeof report.summary.score, 'number');
    assert.equal(typeof report.summary.passed, 'boolean');
    assert.ok(report.summary.score >= 0);
    assert.ok(Array.isArray(report.results));
    assert.equal(report.results.length, 2);
    // Both rules should pass with valid data
    assert.equal(report.results[0].outcome, 'pass');
    assert.equal(report.results[1].outcome, 'pass');
  });

  it('auto-fails when blocker fails', () => {
    const feature = makeFeature();
    const handoff = makeHandoff({ featureId: 'WRONG-ID' });

    const report = grader.gradeFeature(feature, handoff, {});
    assert.equal(report.summary.passed, false);
    assert.equal(report.summary.gradeBand, 'fail');
    assert.equal(report.summary.score, 0);
  });

  it('marks non-applicable rules as na', () => {
    const graderWithConditional = new MissionGrader({
      rules: [
        {
          id: 'R-COND',
          title: 'Conditional test',
          category: 'verification_evidence',
          severity: 'major',
          appliesWhen: { feature: '/fulfills', exists: true },
          evaluation: {
            kind: 'regex_all_match',
            artifact: 'feature',
            pointer: '/fulfills',
            regex: '^VAL-[A-Z0-9]+-[0-9]{3}$',
          },
        },
      ],
      rubric: MINIMAL_RUBRIC,
    });

    const feature = makeFeature({ fulfills: undefined });
    const handoff = makeHandoff();

    const report = graderWithConditional.gradeFeature(feature, handoff, {});
    assert.equal(report.results[0].outcome, 'na');
  });
});

// ---------------------------------------------------------------------------
// precondition_parseable
// ---------------------------------------------------------------------------

describe('precondition_parseable', () => {
  it('passes for standard patterns', () => {
    const r = evaluateKind(
      {
        kind: 'precondition_parseable',
        pointer: '/preconditions',
        patterns: [
          '^[a-z0-9][a-z0-9_-]* completed$',
          '.+ compiles$',
          '^All implementation features for milestone .+ are complete$',
        ],
      },
      { preconditions: ['setup-project completed', 'codebase compiles'] },
      {},
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('still passes for free-form gates (info severity)', () => {
    const r = evaluateKind(
      {
        kind: 'precondition_parseable',
        pointer: '/preconditions',
        patterns: ['^[a-z0-9][a-z0-9_-]* completed$'],
      },
      { preconditions: ['Some custom gate condition'] },
      {},
      '.'
    );
    // Info severity — free-form is allowed
    assert.equal(r.pass, true);
    assert.ok(r.evidence.includes('free-form'));
  });
});

// ---------------------------------------------------------------------------
// json_pointer_all
// ---------------------------------------------------------------------------

describe('json_pointer_all', () => {
  it('passes when all items have required keys', () => {
    const r = evaluateKind(
      {
        kind: 'json_pointer_all',
        artifact: 'handoff',
        pointer: '/cmds',
        itemRule: { requiredKeys: ['command', 'exitCode'] },
      },
      {},
      {
        handoff: {
          cmds: [
            { command: 'test', exitCode: 0 },
            { command: 'lint', exitCode: 0 },
          ],
        },
      },
      '.'
    );
    assert.equal(r.pass, true);
  });

  it('fails when item missing key', () => {
    const r = evaluateKind(
      {
        kind: 'json_pointer_all',
        artifact: 'handoff',
        pointer: '/cmds',
        itemRule: { requiredKeys: ['command', 'exitCode'] },
      },
      {},
      { handoff: { cmds: [{ command: 'test' }] } },
      '.'
    );
    assert.equal(r.pass, false);
  });

  it('returns na for empty array', () => {
    const r = evaluateKind(
      {
        kind: 'json_pointer_all',
        artifact: 'handoff',
        pointer: '/cmds',
        itemRule: { requiredKeys: ['command'] },
      },
      {},
      { handoff: { cmds: [] } },
      '.'
    );
    assert.equal(r.outcome, 'na');
  });
});

// ---------------------------------------------------------------------------
// manual_or_llm
// ---------------------------------------------------------------------------

describe('manual_or_llm', () => {
  it('returns unknown outcome', () => {
    const r = evaluateKind(
      { kind: 'manual_or_llm', rubric: 'Check AGENTS.md compliance' },
      {},
      {},
      '.'
    );
    assert.equal(r.outcome, 'unknown');
  });
});
