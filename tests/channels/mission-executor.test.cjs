'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildFeatureSpec, buildMissionPrompt, CODING_TASK_PROMPT, DEFAULT_HANDOFFS_DIR } = require(
  path.join(__dirname, '..', '..', 'scripts', 'channels', 'daemon', 'mission-executor.cjs')
);
const fs = require('node:fs');

describe('buildFeatureSpec()', () => {
  it('builds a feature spec from task description', () => {
    const spec = buildFeatureSpec('Fix the login validation bug', {
      agentType: 'developer',
      isCoding: true,
      confidence: 'high',
    });

    assert.ok(spec.id.startsWith('tg-'));
    assert.equal(spec.description, 'Fix the login validation bug');
    assert.equal(spec.skillName, 'developer');
    assert.equal(spec.milestone, 'telegram');
    assert.equal(spec.status, 'pending');
    assert.ok(Array.isArray(spec.preconditions));
    assert.ok(Array.isArray(spec.expectedBehavior));
    assert.ok(Array.isArray(spec.verificationSteps));
    assert.ok(spec._meta.source === 'telegram');
  });

  it('includes verification steps for the agent type', () => {
    const spec = buildFeatureSpec('Add unit tests', {
      agentType: 'qa',
      isCoding: true,
      confidence: 'high',
    });

    assert.ok(spec.verificationSteps.length > 0);
    assert.equal(spec.skillName, 'qa');
  });

  it('generates unique IDs for different tasks', () => {
    const spec1 = buildFeatureSpec('Task one', { agentType: 'developer', isCoding: true });
    const spec2 = buildFeatureSpec('Task two', { agentType: 'developer', isCoding: true });
    assert.notEqual(spec1.id, spec2.id);
  });

  it('truncates long descriptions in ID slug', () => {
    const longDesc = 'This is a very long task description that should be truncated in the slug';
    const spec = buildFeatureSpec(longDesc, { agentType: 'developer', isCoding: true });
    const slug = spec.id.replace(/^tg-/, '').replace(/-[a-z0-9]+$/, '');
    const words = slug.split('-');
    assert.ok(words.length <= 6, `Slug has ${words.length} words, expected <= 6`);
  });
});

describe('buildMissionPrompt()', () => {
  it('includes feature spec fields', () => {
    const spec = {
      id: 'test-feature',
      skillName: 'developer',
      description: 'Fix the bug',
      expectedBehavior: ['Login works correctly'],
      verificationSteps: ['pnpm test'],
    };

    const prompt = buildMissionPrompt('Fix the bug', spec);

    assert.ok(prompt.includes('test-feature'));
    assert.ok(prompt.includes('developer'));
    assert.ok(prompt.includes('Login works correctly'));
    assert.ok(prompt.includes('pnpm test'));
    assert.ok(prompt.includes('Fix the bug'));
  });

  it('includes pre-research context when provided', () => {
    const spec = {
      id: 'test',
      skillName: 'dev',
      description: 'x',
      expectedBehavior: [],
      verificationSteps: [],
    };
    const prompt = buildMissionPrompt('task', spec, 'Found relevant file: src/app.js');
    assert.ok(prompt.includes('Pre-Research Context'));
    assert.ok(prompt.includes('src/app.js'));
  });

  it('omits pre-research section when not provided', () => {
    const spec = {
      id: 'test',
      skillName: 'dev',
      description: 'x',
      expectedBehavior: [],
      verificationSteps: [],
    };
    const prompt = buildMissionPrompt('task', spec);
    assert.ok(!prompt.includes('Pre-Research Context'));
  });
});

describe('constants', () => {
  it('coding task prompt file exists', () => {
    assert.ok(fs.existsSync(CODING_TASK_PROMPT), `${CODING_TASK_PROMPT} should exist`);
  });

  it('default handoffs dir is under .claude/context/runtime', () => {
    assert.ok(DEFAULT_HANDOFFS_DIR.includes('channel-handoffs'));
  });
});
