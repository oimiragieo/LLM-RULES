'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assessPlanQuality,
  DIMENSIONS,
} = require('../../.claude/lib/utils/plan-quality-dimensions.cjs');

// Minimal valid plan object
const minimalPlan = {
  goal: 'Add authentication',
  tasks: [
    { id: 't1', description: 'Create JWT middleware', agent: 'developer', estimatedHours: 2 },
    { id: 't2', description: 'Write auth tests', agent: 'qa', estimatedHours: 1 },
  ],
  requirements: ['Users must log in with JWT'],
  risks: ['Token expiry edge cases'],
  artifacts: ['src/auth/jwt.ts'],
};

describe('DIMENSIONS', () => {
  it('exports exactly 8 dimension names', () => {
    assert.equal(DIMENSIONS.length, 8);
  });

  it('includes all required dimension names', () => {
    const expected = [
      'requirement-coverage',
      'task-completeness',
      'dependency-validity',
      'scope-sanity',
      'artifact-wiring',
      'risk-assessment',
      'testability',
      'estimation-quality',
    ];
    for (const name of expected) {
      assert.ok(DIMENSIONS.includes(name), `Missing dimension: ${name}`);
    }
  });
});

describe('assessPlanQuality', () => {
  it('returns a result with dimensions array, overall score, and pass boolean', () => {
    const result = assessPlanQuality(minimalPlan);
    assert.ok(Array.isArray(result.dimensions));
    assert.equal(typeof result.overall, 'number');
    assert.equal(typeof result.pass, 'boolean');
  });

  it('returns exactly 8 dimension entries', () => {
    const result = assessPlanQuality(minimalPlan);
    assert.equal(result.dimensions.length, 8);
  });

  it('each dimension entry has name, score, and issues array', () => {
    const result = assessPlanQuality(minimalPlan);
    for (const dim of result.dimensions) {
      assert.ok(typeof dim.name === 'string');
      assert.ok(typeof dim.score === 'number');
      assert.ok(Array.isArray(dim.issues));
    }
  });

  it('scores are between 0 and 1 inclusive', () => {
    const result = assessPlanQuality(minimalPlan);
    for (const dim of result.dimensions) {
      assert.ok(
        dim.score >= 0 && dim.score <= 1,
        `Score out of range for ${dim.name}: ${dim.score}`
      );
    }
  });

  it('overall score is between 0 and 1 inclusive', () => {
    const result = assessPlanQuality(minimalPlan);
    assert.ok(result.overall >= 0 && result.overall <= 1);
  });

  it('pass is true for a well-formed plan with all fields', () => {
    const result = assessPlanQuality(minimalPlan);
    assert.equal(result.pass, true);
  });

  it('pass is false for a plan missing required fields', () => {
    const badPlan = { goal: 'do something' }; // no tasks, no requirements, etc.
    const result = assessPlanQuality(badPlan);
    assert.equal(result.pass, false);
  });

  it('a plan with no tasks has low task-completeness score', () => {
    const plan = { ...minimalPlan, tasks: [] };
    const result = assessPlanQuality(plan);
    const taskDim = result.dimensions.find(d => d.name === 'task-completeness');
    assert.ok(taskDim.score < 0.5);
  });

  it('a plan with no risks has low risk-assessment score', () => {
    const plan = { ...minimalPlan, risks: [] };
    const result = assessPlanQuality(plan);
    const riskDim = result.dimensions.find(d => d.name === 'risk-assessment');
    assert.ok(riskDim.score < 0.5);
  });

  it('a plan with no requirements has low requirement-coverage score', () => {
    const plan = { ...minimalPlan, requirements: [] };
    const result = assessPlanQuality(plan);
    const reqDim = result.dimensions.find(d => d.name === 'requirement-coverage');
    assert.ok(reqDim.score < 0.5);
  });

  it('issues array is populated with strings describing problems', () => {
    const badPlan = { goal: 'do something' };
    const result = assessPlanQuality(badPlan);
    const allIssues = result.dimensions.flatMap(d => d.issues);
    assert.ok(allIssues.length > 0);
    for (const issue of allIssues) {
      assert.equal(typeof issue, 'string');
    }
  });

  it('overall is the mean of dimension scores', () => {
    const result = assessPlanQuality(minimalPlan);
    const mean = result.dimensions.reduce((s, d) => s + d.score, 0) / result.dimensions.length;
    assert.ok(Math.abs(result.overall - mean) < 0.001);
  });
});
