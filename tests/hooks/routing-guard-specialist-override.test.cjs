'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Set enforcement mode before requiring modules
process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';

const {
  checkSpecialistOverride,
} = require('../../.claude/hooks/routing/routing-guard-core.checks-task.cjs');

describe('Routing Guard Integration - Check 7: Specialist Override', () => {
  test('should block developer spawn when technical-writer keyword is present', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Your task is to update documentation for the API.',
      description: 'Updating docs',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, false, 'Should block developer for documentation task');
    assert.strictEqual(result.result, 'block');
    assert.match(
      result.message,
      /\[SPECIALIST-OVERRIDE\]/,
      'Error message should mention specialist override'
    );
    assert.match(
      result.message,
      /technical-writer/,
      'Error message should suggest technical-writer'
    );
  });

  test('should block developer spawn when qa keyword is present', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are the developer. Please write tests for the user service.',
      description: 'Adding test coverage',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, false, 'Should block developer for testing task');
    assert.match(result.message, /qa/, 'Error message should suggest qa');
  });

  test('should block developer spawn when code-simplifier keyword is present', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are a developer. Clean up code in the routing module.',
      description: 'Refactoring for clarity',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, false, 'Should block developer for cleanup task');
    assert.match(result.message, /code-simplifier/, 'Error message should suggest code-simplifier');
  });

  test('should allow developer spawn when no specialist keywords match', () => {
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are a developer. Implement the new user profile feature.',
      description: 'Feature implementation',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow developer for general implementation');
  });

  test('should allow specialist spawn even if keywords match', () => {
    // If we explicitly spawn the specialist, it should pass
    const toolInput = {
      subagent_type: 'technical-writer',
      prompt: 'You are technical-writer. Update documentation.',
      description: 'Docs update',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(result.pass, true, 'Should allow specialist spawns');
  });
});
