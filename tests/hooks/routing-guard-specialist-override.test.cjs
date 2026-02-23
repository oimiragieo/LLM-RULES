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

  // Fix A: Update-intent bypass for creator specialist keywords
  test('should allow developer when update intent present even if creator keyword appears incidentally', () => {
    // RED: currently fails — "new skill" triggers skill-creator SPECIALIST-OVERRIDE block
    const toolInput = {
      subagent_type: 'developer',
      prompt:
        'You are developer. Update the omega-gemini-cli skill to support gemini 2.0. Note: omega-gemini-cli is a new skill added recently to the catalog.',
      description: 'Updating omega-gemini-cli skill',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(
      result.pass,
      true,
      'Should allow developer when update intent overrides incidental creator keyword'
    );
  });

  test('should allow developer when skill-updater suffix in prompt even if skill-creator appears as context', () => {
    // RED: currently fails — "skill-creator" triggers SPECIALIST-OVERRIDE block
    const toolInput = {
      subagent_type: 'developer',
      prompt:
        'You are developer. Use skill-updater to refresh the tdd skill. The tdd skill was originally built with skill-creator.',
      description: 'Updating tdd skill via skill-updater',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(
      result.pass,
      true,
      'Should allow developer when -updater suffix detects update intent overriding incidental creator keyword'
    );
  });

  test('should still block developer when creator keyword present with genuine creation intent', () => {
    // GREEN: this should continue to fail as intended (no update intent)
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Create a new skill for handling gemini API calls.',
      description: 'Creating a new gemini skill',
    };

    const result = checkSpecialistOverride('Task', toolInput);

    assert.strictEqual(
      result.pass,
      false,
      'Should still block developer for genuine skill creation'
    );
    assert.match(result.message, /\[SPECIALIST-OVERRIDE\]/, 'Should report specialist override');
    assert.match(result.message, /skill-creator/, 'Should suggest skill-creator');
  });
});
