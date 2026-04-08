'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { classify, getVerificationSteps, CODING_PATTERNS, VERIFICATION_DEFAULTS } = require(
  path.join(__dirname, '..', '..', 'scripts', 'channels', 'daemon', 'skill-router.cjs')
);

describe('skill-router classify()', () => {
  it('classifies frontend coding tasks', () => {
    const result = classify('Add a React component for the settings page');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'frontend-pro');
    assert.equal(result.confidence, 'high');
  });

  it('classifies database tasks', () => {
    const result = classify('Create a migration to add user_roles table');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'database-architect');
  });

  it('classifies test writing tasks', () => {
    const result = classify('Write unit tests for the payment module');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'qa');
  });

  it('classifies code review tasks', () => {
    const result = classify('Review the pull request for login changes');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'code-reviewer');
  });

  it('classifies refactoring tasks', () => {
    const result = classify('Refactor the user service to reduce duplication');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'code-simplifier');
  });

  it('classifies Rust tasks', () => {
    const result = classify('Fix the cargo build error in omega-core');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'rust-pro');
  });

  it('classifies generic fix requests as coding via verb detection', () => {
    const result = classify('Fix the broken login form');
    assert.equal(result.isCoding, true);
    assert.ok(['developer', 'frontend-pro'].includes(result.agentType));
  });

  it('classifies general questions as non-coding', () => {
    const result = classify('What is the current git branch?');
    assert.equal(result.isCoding, false);
    assert.equal(result.agentType, 'general-assistant');
  });

  it('classifies greetings as non-coding', () => {
    const result = classify('Hello, how are you?');
    assert.equal(result.isCoding, false);
  });

  it('classifies search requests as non-coding', () => {
    const result = classify('Search for information about React hooks');
    assert.equal(result.isCoding, false);
  });

  it('returns non-coding for empty input', () => {
    const result = classify('');
    assert.equal(result.isCoding, false);
    assert.equal(result.confidence, 'none');
  });

  it('returns non-coding for null input', () => {
    const result = classify(null);
    assert.equal(result.isCoding, false);
  });

  it('classifies DevOps tasks', () => {
    const result = classify('Set up a Docker container for the API');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'devops');
  });

  it('classifies security tasks', () => {
    const result = classify('Add JWT authentication to the API endpoints');
    assert.equal(result.isCoding, true);
    assert.equal(result.agentType, 'security-architect');
  });
});

describe('skill-router getVerificationSteps()', () => {
  it('returns lint and test for developer', () => {
    const steps = getVerificationSteps('developer');
    assert.ok(steps.includes('pnpm lint:fix'));
    assert.ok(steps.includes('pnpm test'));
  });

  it('returns cargo commands for rust-pro', () => {
    const steps = getVerificationSteps('rust-pro');
    assert.ok(steps.some(s => s.includes('cargo test')));
  });

  it('returns default steps for unknown agent', () => {
    const steps = getVerificationSteps('nonexistent-agent');
    assert.ok(steps.length > 0);
  });

  it('returns empty for read-only agents', () => {
    const steps = getVerificationSteps('code-reviewer');
    assert.equal(steps.length, 0);
  });
});

describe('skill-router constants', () => {
  it('has at least 10 coding patterns', () => {
    assert.ok(CODING_PATTERNS.length >= 10);
  });

  it('has verification defaults for all pattern agent types', () => {
    for (const { agentType } of CODING_PATTERNS) {
      assert.ok(
        agentType in VERIFICATION_DEFAULTS,
        `Missing verification defaults for ${agentType}`
      );
    }
  });
});
