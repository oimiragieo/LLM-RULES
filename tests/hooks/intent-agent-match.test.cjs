/**
 * Tests for intent-agent-match.cjs hook
 * Task #38 (Deliverable 1)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const hookPath = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'intent-agent-match.cjs');

describe('intent-agent-match hook', () => {
  let processIntentCheck;

  beforeEach(() => {
    // Load hook module
    delete require.cache[require.resolve(hookPath)];
    const hook = require(hookPath);
    processIntentCheck = hook.processIntentCheck;
  });

  afterEach(() => {
    delete require.cache[require.resolve(hookPath)];
  });

  it('should allow when no intent signals detected', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Implement a simple helper function.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.deepStrictEqual(result, { result: {} });
  });

  it('should warn when security signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Implement authentication and credential validation.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('auth'));
    assert.ok(result.reason.includes('credential'));
    assert.ok(result.reason.includes('security-architect'));
  });

  it('should warn when testing signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Add test coverage and assertions for the module.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('test'));
    assert.ok(result.reason.includes('coverage'));
    assert.ok(result.reason.includes('qa'));
  });

  it('should allow when security-architect is included for security signals', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'security-architect',
        prompt: 'You are security-architect. Review authentication implementation for vulnerabilities.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.deepStrictEqual(result, { result: {} });
  });

  it('should warn when architecture signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Design the database schema for the user system.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('design'));
    assert.ok(result.reason.includes('database'));
    assert.ok(result.reason.includes('architect'));
  });

  it('should allow when architect is spawned for architecture signals', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'architect',
        prompt: 'You are architect. Design the system architecture for scalability.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.deepStrictEqual(result, { result: {} });
  });

  it('should warn when documentation signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Write API documentation and user guide.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('documentation') || result.reason.includes('API'));
    assert.ok(result.reason.includes('technical-writer'));
  });

  it('should warn when deployment signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Set up the CI/CD pipeline and deploy to production.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('CI/CD') || result.reason.includes('deploy'));
    assert.ok(result.reason.includes('devops'));
  });

  it('should warn when planning signals detected but spawning developer', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Plan the implementation strategy for the new feature.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.reason.includes('plan'));
    assert.ok(result.reason.includes('planner'));
  });

  it('should pass through non-Task tools', () => {
    const hookData = {
      tool_name: 'Read',
      tool_input: {
        file_path: 'test.txt',
      },
    };

    const result = processIntentCheck(hookData);
    assert.deepStrictEqual(result, { result: {} });
  });

  it('should handle multiple intent signals and report all', () => {
    const hookData = {
      tool_name: 'Task',
      tool_input: {
        subagent_type: 'developer',
        prompt: 'You are developer. Design authentication with test coverage and API docs.',
      },
    };

    const result = processIntentCheck(hookData);
    assert.strictEqual(result.result, 'warn');
    // Should detect multiple signals (design, auth, test, API)
    const reason = result.reason.toLowerCase();
    assert.ok(reason.includes('design') || reason.includes('auth') || reason.includes('test'));
  });
});
