#!/usr/bin/env node
/**
 * Tests for auto-rerouter.cjs
 *
 * Run with: node auto-rerouter.test.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test tracking
let passCount = 0;
let failCount = 0;
const tests = [];
let tempDir;

/**
 * Simple test framework
 */
function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('\nauto-rerouter.cjs Tests\n' + '='.repeat(50));

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`    ✓ ${test.name}`);
      passCount++;
    } catch (err) {
      console.log(`    ✗ ${test.name}`);
      console.log(`      Error: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passCount} passed, ${failCount} failed`);

  // Cleanup
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  process.exit(failCount > 0 ? 1 : 0);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function _assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ============================================
// Setup
// ============================================

function setup() {
  // Create temp directory for tests
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-rerouter-test-'));

  // Load the module
  const rerouter = require('../../.claude/hooks/self-healing/auto-rerouter.cjs');

  // Set up test file paths
  const testStateFile = path.join(tempDir, 'rerouter-state.json');
  rerouter.setStateFile(testStateFile);

  return { rerouter, tempDir, testStateFile };
}

// ============================================
// Tests: isEnabled
// ============================================

describe('isEnabled', () => {
  it('should be enabled by default', () => {
    const { rerouter } = setup();
    delete process.env.REROUTER_MODE;
    assert(rerouter.isEnabled(), 'Should be enabled by default');
  });

  it('should be disabled when REROUTER_MODE=off', () => {
    const { rerouter } = setup();
    process.env.REROUTER_MODE = 'off';
    assert(!rerouter.isEnabled(), 'Should be disabled when off');
    delete process.env.REROUTER_MODE;
  });

  it('should be enabled when REROUTER_MODE=suggest', () => {
    const { rerouter } = setup();
    process.env.REROUTER_MODE = 'suggest';
    assert(rerouter.isEnabled(), 'Should be enabled in suggest mode');
    delete process.env.REROUTER_MODE;
  });
});

// ============================================
// Tests: Agent Alternatives
// ============================================

describe('AGENT_ALTERNATIVES', () => {
  it('should define alternatives for architect', () => {
    const { rerouter } = setup();
    assert(rerouter.AGENT_ALTERNATIVES.architect, 'Should have architect alternatives');
    assert(rerouter.AGENT_ALTERNATIVES.architect.includes('planner'), 'Should include planner');
  });

  it('should define alternatives for developer', () => {
    const { rerouter } = setup();
    assert(rerouter.AGENT_ALTERNATIVES.developer, 'Should have developer alternatives');
    assert(
      rerouter.AGENT_ALTERNATIVES.developer.length > 0,
      'Should have at least one alternative'
    );
  });

  it('should define alternatives for qa', () => {
    const { rerouter } = setup();
    assert(rerouter.AGENT_ALTERNATIVES.qa, 'Should have qa alternatives');
  });
});

// ============================================
// Tests: State Management
// ============================================

describe('State Management', () => {
  it('should return default state when file does not exist', () => {
    const { rerouter, testStateFile } = setup();
    // Ensure file doesn't exist
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }

    const state = rerouter.loadState();
    assert(state.agentFailures, 'Should have agentFailures');
    assert(state.taskStartTimes, 'Should have taskStartTimes');
    assert(state.modelUsage, 'Should have modelUsage');
  });

  it('should save and load state correctly', () => {
    const { rerouter, _testStateFile } = setup();

    const testState = {
      agentFailures: { architect: 2 },
      taskStartTimes: { 42: new Date().toISOString() },
      modelUsage: { opus: 5 },
    };

    rerouter.saveState(testState);
    const loaded = rerouter.loadState();

    assertEqual(loaded.agentFailures.architect, 2, 'Should preserve agentFailures');
    assert(loaded.taskStartTimes['42'], 'Should preserve taskStartTimes');
    assertEqual(loaded.modelUsage.opus, 5, 'Should preserve modelUsage');
  });
});

// ============================================
// Tests: Agent Failure Detection
// ============================================

describe('Agent Failure Detection', () => {
  it('should record agent failure', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('architect', 'Task timeout');
    const state = rerouter.loadState();

    assertEqual(state.agentFailures.architect.count, 1, 'Should have 1 failure');
    assert(state.agentFailures.architect.errors.includes('Task timeout'), 'Should record error');
  });

  it('should increment failure count on multiple failures', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('architect', 'Error 1');
    rerouter.recordAgentFailure('architect', 'Error 2');
    const state = rerouter.loadState();

    assertEqual(state.agentFailures.architect.count, 2, 'Should have 2 failures');
  });

  it('should suggest alternative when failures >= 2', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('architect', 'Error 1');
    rerouter.recordAgentFailure('architect', 'Error 2');

    const suggestion = rerouter.checkAgentFailures('architect');
    assert(suggestion.shouldReroute, 'Should suggest rerouting');
    assert(
      suggestion.suggestion.includes('planner') || suggestion.suggestion.includes('developer'),
      'Should suggest alternative agent'
    );
  });

  it('should not suggest reroute for single failure', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('developer', 'Error 1');

    const suggestion = rerouter.checkAgentFailures('developer');
    assert(!suggestion.shouldReroute, 'Should not suggest rerouting for single failure');
  });

  it('should clear failures after successful task', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('qa', 'Error 1');
    rerouter.recordAgentFailure('qa', 'Error 2');
    rerouter.clearAgentFailures('qa');

    const state = rerouter.loadState();
    assert(!state.agentFailures.qa || state.agentFailures.qa.count === 0, 'Should clear failures');
  });
});

// ============================================
// Tests: Skill Not Found Detection
// ============================================

describe('Skill Not Found Detection', () => {
  it('should detect skill not found from Skill tool error', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Skill',
      error: 'Skill "unknown-skill" not found',
    };

    const result = rerouter.detectSkillNotFound(input);
    assert(result.detected, 'Should detect skill not found');
    assertEqual(result.skillName, 'unknown-skill', 'Should extract skill name');
  });

  it('should not detect when no error', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Skill',
      success: true,
    };

    const result = rerouter.detectSkillNotFound(input);
    assert(!result.detected, 'Should not detect when successful');
  });

  it('should suggest evolution when skill not found', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Skill',
      error: 'Skill "custom-skill" not found',
    };

    const result = rerouter.detectSkillNotFound(input);
    assert(
      result.suggestion.includes('evolution') || result.suggestion.includes('skill-creator'),
      'Should suggest evolution/creation'
    );
  });
});

// ============================================
// Tests: Resource Constraint Detection
// ============================================

describe('Resource Constraint Detection', () => {
  it('should detect opus model usage limit', () => {
    const { rerouter } = setup();

    // Record many opus usages
    for (let i = 0; i < 10; i++) {
      rerouter.recordModelUsage('opus');
    }

    const result = rerouter.checkResourceConstraints();
    assert(result.detected, 'Should detect resource constraint');
    assert(
      result.suggestion.includes('sonnet') || result.suggestion.includes('haiku'),
      'Should suggest lower-cost model'
    );
  });

  it('should not flag low model usage', () => {
    const { rerouter } = setup();

    rerouter.recordModelUsage('opus');
    rerouter.recordModelUsage('opus');

    const result = rerouter.checkResourceConstraints();
    assert(!result.detected, 'Should not detect constraint for low usage');
  });

  it('should record model usage correctly', () => {
    const { rerouter } = setup();

    rerouter.recordModelUsage('sonnet');
    rerouter.recordModelUsage('sonnet');
    rerouter.recordModelUsage('opus');

    const state = rerouter.loadState();
    assertEqual(state.modelUsage.sonnet, 2, 'Should track sonnet usage');
    assertEqual(state.modelUsage.opus, 1, 'Should track opus usage');
  });
});

// ============================================
// Tests: Task Stuck Detection
// ============================================

describe('Task Stuck Detection', () => {
  it('should detect task stuck for >10 minutes', () => {
    const { rerouter } = setup();

    // Set task start time to 15 minutes ago
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    rerouter.recordTaskStart('42', fifteenMinutesAgo);

    const result = rerouter.checkTaskStuck('42');
    assert(result.detected, 'Should detect stuck task');
    assert(
      result.suggestion.includes('decompose') || result.suggestion.includes('smaller'),
      'Should suggest decomposition'
    );
  });

  it('should not flag recent task', () => {
    const { rerouter } = setup();

    // Set task start time to 2 minutes ago
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    rerouter.recordTaskStart('43', twoMinutesAgo);

    const result = rerouter.checkTaskStuck('43');
    assert(!result.detected, 'Should not detect stuck for recent task');
  });

  it('should record task start correctly', () => {
    const { rerouter } = setup();

    rerouter.recordTaskStart('44');
    const state = rerouter.loadState();

    assert(state.taskStartTimes['44'], 'Should record task start time');
  });

  it('should clear task on completion', () => {
    const { rerouter } = setup();

    rerouter.recordTaskStart('45');
    rerouter.clearTaskStart('45');

    const state = rerouter.loadState();
    assert(!state.taskStartTimes['45'], 'Should clear task start time');
  });
});

// ============================================
// Tests: getSuggestion
// ============================================

describe('getSuggestion Integration', () => {
  it('should return agent failure suggestion for Task PostToolUse with error', () => {
    const { rerouter } = setup();

    // Setup: record previous failure
    rerouter.recordAgentFailure('architect', 'Previous error');

    const input = {
      tool_name: 'Task',
      error: 'Agent failed',
      tool_input: {
        prompt: 'You are the architect agent',
      },
    };

    const suggestions = rerouter.getSuggestions(input);
    // Should detect architect agent from prompt and record failure
    assert(Array.isArray(suggestions), 'Should return array of suggestions');
  });

  it('should return skill not found suggestion', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Skill',
      error: 'Skill "new-skill" not found',
    };

    const suggestions = rerouter.getSuggestions(input);
    assert(suggestions.length > 0, 'Should return suggestion');
    assert(suggestions[0].type === 'skill_not_found', 'Should be skill not found type');
  });

  it('should return empty array when no issues', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Read',
      success: true,
    };

    const suggestions = rerouter.getSuggestions(input);
    assertEqual(suggestions.length, 0, 'Should return no suggestions');
  });
});

// ============================================
// Tests: extractAgentFromPrompt
// ============================================

describe('extractAgentFromPrompt', () => {
  it('should extract agent from "You are the X agent" pattern', () => {
    const { rerouter } = setup();

    const prompt = 'You are the developer agent. Fix the bug...';
    const agent = rerouter.extractAgentFromPrompt(prompt);
    assertEqual(agent, 'developer', 'Should extract developer');
  });

  it('should extract agent from "You are AGENT" pattern', () => {
    const { rerouter } = setup();

    const prompt = 'You are PLANNER. Create a plan for...';
    const agent = rerouter.extractAgentFromPrompt(prompt);
    assertEqual(agent, 'planner', 'Should extract planner');
  });

  it('should return null for unrecognized prompt', () => {
    const { rerouter } = setup();

    const prompt = 'Do something generic';
    const agent = rerouter.extractAgentFromPrompt(prompt);
    assertEqual(agent, null, 'Should return null');
  });
});

// ============================================
// Tests: Output Format
// ============================================

describe('Output Format', () => {
  it('should return properly formatted agent failure suggestion', () => {
    const { rerouter } = setup();

    rerouter.recordAgentFailure('architect', 'Error 1');
    rerouter.recordAgentFailure('architect', 'Error 2');

    const result = rerouter.checkAgentFailures('architect');

    assert(result.type === 'agent_failure', 'Should have type');
    assert(typeof result.suggestion === 'string', 'Should have suggestion string');
    assert(result.agent === 'architect', 'Should have agent');
    assert(typeof result.failureCount === 'number', 'Should have failure count');
  });

  it('should return properly formatted skill not found suggestion', () => {
    const { rerouter } = setup();

    const input = {
      tool_name: 'Skill',
      error: 'Skill "my-skill" not found',
    };

    const result = rerouter.detectSkillNotFound(input);

    assert(result.type === 'skill_not_found', 'Should have type');
    assert(typeof result.suggestion === 'string', 'Should have suggestion');
    assert(result.skillName === 'my-skill', 'Should have skill name');
  });

  it('should return properly formatted resource constraint suggestion', () => {
    const { rerouter } = setup();

    for (let i = 0; i < 15; i++) {
      rerouter.recordModelUsage('opus');
    }

    const result = rerouter.checkResourceConstraints();

    assert(result.type === 'resource_constraint', 'Should have type');
    assert(typeof result.suggestion === 'string', 'Should have suggestion');
    assert(result.model === 'opus', 'Should have model');
  });

  it('should return properly formatted task stuck suggestion', () => {
    const { rerouter } = setup();

    const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    rerouter.recordTaskStart('99', oldTime);

    const result = rerouter.checkTaskStuck('99');

    assert(result.type === 'task_stuck', 'Should have type');
    assert(typeof result.suggestion === 'string', 'Should have suggestion');
    assert(result.taskId === '99', 'Should have task ID');
    assert(typeof result.durationMinutes === 'number', 'Should have duration');
  });
});

// ============================================
// Run all tests
// ============================================

runTests();
