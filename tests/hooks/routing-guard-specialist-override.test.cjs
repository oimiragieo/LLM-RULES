#!/usr/bin/env node
/**
 * Tests for routing-guard.cjs Check 7 (specialist-override)
 *
 * Tests the specialist routing enforcement that warns when 'developer'
 * is spawned for tasks that match specialist agent keywords.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Get project root
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Load the hook module
const routingGuard = require(path.join(PROJECT_ROOT, '.claude/hooks/routing/routing-guard.cjs'));

describe('Check 7: Specialist Override', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Clear enforcement env vars
    delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;

    // Invalidate cached state
    routingGuard.invalidateCachedState();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;

    // Invalidate cached state
    routingGuard.invalidateCachedState();
  });

  it('should warn when developer spawn contains documentation keywords', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are the developer. Update the README documentation.',
      description: 'Write API documentation for the auth module',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should return warn result');
    assert.ok(result.message, 'Should have warning message');
    assert.ok(result.message.includes('technical-writer'), 'Should suggest technical-writer');
  });

  it('should warn when developer spawn contains test keywords', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Write tests for the authentication module.',
      description: 'Add test coverage for login flow',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should return warn result');
    assert.ok(result.message.includes('qa'), 'Should suggest qa agent');
  });

  it('should warn when developer spawn contains refactor keywords', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are the developer. Refactor the auth module to simplify it.',
      description: 'Clean up code and reduce complexity',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should return warn result');
    assert.ok(result.message.includes('code-simplifier'), 'Should suggest code-simplifier');
  });

  it('should allow developer spawn for generic coding tasks', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the new authentication feature.',
      description: 'Add JWT support to the API',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not return warn/block');
    assert.strictEqual(result.message, undefined, 'Should have no message');
  });

  it('should skip check for non-developer spawns', () => {
    const toolInput = {
      subagent_type: 'qa',
      prompt: 'You are QA. Write tests for authentication.',
      description: 'Test coverage for auth',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not check non-developer');
  });

  it('should skip check when enforcement is off', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'off';

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Update the documentation.',
      description: 'Write docs',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should skip check when off');
  });

  it('should block when enforcement is block mode', () => {
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are the developer. Update readme with new endpoints.',
      description: 'Documentation updates',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, false, 'Should block in block mode');
    assert.strictEqual(result.result, 'block', 'Should return block result');
    assert.ok(result.message.includes('technical-writer'), 'Should suggest specialist');
  });

  it('should detect multiple specialist keywords and suggest first match', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Refactor code and update docs.',
      description: 'Clean up and document',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn');
    // Should suggest either code-simplifier or technical-writer (first match)
    assert.ok(
      result.message.includes('code-simplifier') || result.message.includes('technical-writer'),
      'Should suggest a specialist'
    );
  });

  it('should check both prompt and description for keywords', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement feature.',
      description: 'Write comprehensive test suite for the new API',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn');
    assert.ok(result.message.includes('qa'), 'Should suggest qa from description');
  });

  it('should verify SPECIALIST_KEYWORD_MAP is exported', () => {
    assert.ok(
      routingGuard.SPECIALIST_KEYWORD_MAP,
      'SPECIALIST_KEYWORD_MAP should be exported'
    );
    assert.ok(
      routingGuard.SPECIALIST_KEYWORD_MAP['technical-writer'],
      'Should have technical-writer keywords'
    );
    assert.ok(
      routingGuard.SPECIALIST_KEYWORD_MAP['code-simplifier'],
      'Should have code-simplifier keywords'
    );
  });

  // ========================================================================
  // FALSE POSITIVE REGRESSION TESTS (ADR-088)
  // ========================================================================

  it('developer spawn with incidental "document" mention should not warn', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Document what the function does in JSDoc comments.',
      description: 'Add inline code documentation',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not warn for inline comments');
    assert.strictEqual(result.message, undefined, 'Should have no message');
  });

  it('developer spawn with "deploy the fix" should not warn', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Deploy the fix for the auth bug.',
      description: 'Apply the authentication patch',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not warn for deploying a fix');
    assert.strictEqual(result.message, undefined, 'Should have no message');
  });

  it('developer spawn with "fix the migration script" should not warn', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Fix the migration script error.',
      description: 'Debug the data migration bug',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not warn for fixing migration code');
    assert.strictEqual(result.message, undefined, 'Should have no message');
  });

  it('developer spawn with "test the auth fix" should not warn', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the fix and test the auth changes.',
      description: 'Fix authentication and verify it works',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow');
    assert.strictEqual(result.result, undefined, 'Should not warn for developer testing own code');
    assert.strictEqual(result.message, undefined, 'Should have no message');
  });

  // TRUE POSITIVE TESTS - These SHOULD trigger warnings

  it('developer spawn with "write documentation" should warn (true positive)', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Write documentation for the new endpoints.',
      description: 'Create API documentation',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn for documentation task');
    assert.ok(result.message.includes('technical-writer'), 'Should suggest technical-writer');
  });

  it('developer spawn with "deploy to production" should warn (true positive)', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Deploy to production environment.',
      description: 'Production deployment setup',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn for deployment task');
    assert.ok(result.message.includes('devops'), 'Should suggest devops');
  });

  it('developer spawn with "database migration" should warn (true positive)', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Create database migration for new schema.',
      description: 'Schema migration for users table',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn for migration task');
    assert.ok(
      result.message.includes('database-architect'),
      'Should suggest database-architect'
    );
  });

  it('developer spawn with "run tests" should warn (true positive)', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Run tests and analyze coverage.',
      description: 'Execute test suite and report results',
    };

    const result = routingGuard.checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow (warn mode)');
    assert.strictEqual(result.result, 'warn', 'Should warn for test execution task');
    assert.ok(result.message.includes('qa'), 'Should suggest qa');
  });
});
