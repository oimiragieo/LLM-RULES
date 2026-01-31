#!/usr/bin/env node
/**
 * Tests for plan-evolution-guard.cjs
 *
 * Tests that plans written to .claude/context/plans/ must contain
 * the mandatory Evolution & Reflection phase.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test framework
let passed = 0;
let failed = 0;
const results = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertMatch(str, regex, message = '') {
  if (!regex.test(str)) {
    throw new Error(`${message}\nString did not match pattern: ${regex}\nString: ${str}`);
  }
}

function _assertNotEqual(actual, expected, message = '') {
  if (actual === expected) {
    throw new Error(`${message}\nExpected NOT to equal: ${expected}`);
  }
}

// Paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(__dirname, 'plan-evolution-guard.cjs');

/**
 * Run the hook with given input
 * @param {Object} hookInput - The hook input object
 * @param {Object} env - Environment variables to set
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runHook(hookInput, env = {}) {
  const inputJson = hookInput ? JSON.stringify(hookInput) : '';

  const result = spawnSync('node', [HOOK_PATH], {
    input: inputJson,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 5000,
  });

  return {
    exitCode: result.status || 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Create a mock hook input for Write tool
 */
function createWriteInput(filePath, content) {
  return {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: content,
    },
  };
}

// Sample plan content WITH Evolution phase
const PLAN_WITH_EVOLUTION = `# Feature Plan: Add User Auth

## Phase 1: Research
Tasks:
1. Research OAuth providers

## Phase 2: Implementation
Tasks:
1. Implement login flow

## Phase 3: Testing
Tasks:
1. Write unit tests

### Phase [FINAL]: Evolution & Reflection Check
**Purpose**: Quality assessment and learning extraction
**Tasks**:
1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities
`;

// Sample plan content WITHOUT Evolution phase
const PLAN_WITHOUT_EVOLUTION = `# Feature Plan: Add User Auth

## Phase 1: Research
Tasks:
1. Research OAuth providers

## Phase 2: Implementation
Tasks:
1. Implement login flow

## Phase 3: Testing
Tasks:
1. Write unit tests
`;

// Sample plan with alternative Evolution formats
const PLAN_WITH_EVOLUTION_ALT1 = `# Plan

## Phase 1: Do stuff

## Phase FINAL: Evolution
- Reflect on work
`;

const PLAN_WITH_EVOLUTION_ALT2 = `# Plan

## Phase 1: Do stuff

## Evolution & Reflection
- Reflect on work
`;

const PLAN_WITH_REFLECTION_AGENT = `# Plan

## Phase 1: Do stuff

## Final Phase
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection"
})
`;

// ============================================================================
// TESTS
// ============================================================================

describe('Plan Evolution Guard - Basic Functionality', () => {
  it('should allow plan with Evolution phase', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITH_EVOLUTION);
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should exit 0 for plan with Evolution phase');
  });

  it('should block plan without Evolution phase', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITHOUT_EVOLUTION);
    const result = runHook(input);

    assertEqual(result.exitCode, 2, 'Should exit 2 for plan without Evolution phase');
  });

  it('should include helpful error message when blocking', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITHOUT_EVOLUTION);
    const result = runHook(input);

    assertMatch(result.stderr, /MISSING EVOLUTION PHASE/i, 'Error should mention missing phase');
    assertMatch(result.stderr, /Phase \[FINAL\]/i, 'Error should show example format');
  });
});

describe('Plan Evolution Guard - Alternative Formats', () => {
  it('should allow "Phase FINAL: Evolution" format', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITH_EVOLUTION_ALT1);
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should accept Phase FINAL: Evolution format');
  });

  it('should allow "Evolution & Reflection" format', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITH_EVOLUTION_ALT2);
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should accept Evolution & Reflection format');
  });

  it('should allow plan with reflection-agent spawn', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITH_REFLECTION_AGENT);
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should accept plan with reflection-agent');
  });
});

describe('Plan Evolution Guard - Non-Plan Files', () => {
  it('should allow non-plan files without Evolution phase', () => {
    const filePath = path.join(PROJECT_ROOT, 'src', 'index.ts');
    const input = createWriteInput(filePath, 'console.log("hello")');
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should allow non-plan files');
  });

  it('should allow files outside plans directory', () => {
    const filePath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
    const input = createWriteInput(filePath, '# Learning\nSome content');
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should allow files outside plans directory');
  });

  it('should allow non-markdown files in plans directory', () => {
    const filePath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'config.json');
    const input = createWriteInput(filePath, '{"key": "value"}');
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should allow non-markdown files');
  });
});

describe('Plan Evolution Guard - Environment Overrides', () => {
  it('should respect PLAN_EVOLUTION_GUARD=off', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITHOUT_EVOLUTION);
    const result = runHook(input, { PLAN_EVOLUTION_GUARD: 'off' });

    assertEqual(result.exitCode, 0, 'Should allow when enforcement is off');
  });

  it('should warn but allow with PLAN_EVOLUTION_GUARD=warn', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITHOUT_EVOLUTION);
    const result = runHook(input, { PLAN_EVOLUTION_GUARD: 'warn' });

    assertEqual(result.exitCode, 0, 'Should exit 0 in warn mode');
    assertMatch(result.stderr, /warn/i, 'Should output warning');
  });
});

describe('Plan Evolution Guard - Edge Cases', () => {
  it('should handle empty content gracefully', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'empty-plan.md');
    const input = createWriteInput(planPath, '');
    const result = runHook(input);

    assertEqual(result.exitCode, 2, 'Empty plan should be blocked (no Evolution phase)');
  });

  it('should handle no input gracefully', () => {
    const result = runHook(null);
    // Should allow (fail open) or exit 0 for no input
    assertEqual(result.exitCode, 0, 'Should handle missing input gracefully');
  });

  it('should handle malformed JSON input gracefully', () => {
    // Send malformed JSON as input
    const result = spawnSync('node', [HOOK_PATH], {
      input: 'not json',
      encoding: 'utf8',
      env: process.env,
      timeout: 5000,
    });

    // Should fail open (exit 0) for malformed input
    assertEqual(result.status, 0, 'Should handle malformed JSON gracefully');
  });

  it('should handle Windows paths correctly', () => {
    const planPath = 'C:\\dev\\projects\\agent-studio\\.claude\\context\\plans\\test-plan.md';
    const input = createWriteInput(planPath, PLAN_WITH_EVOLUTION);
    const result = runHook(input);

    assertEqual(result.exitCode, 0, 'Should handle Windows paths');
  });
});

describe('Plan Evolution Guard - Security', () => {
  it('should audit log when enforcement is disabled', () => {
    const planPath = path.join(PROJECT_ROOT, '.claude', 'context', 'plans', 'test-plan.md');
    const input = createWriteInput(planPath, PLAN_WITHOUT_EVOLUTION);
    const result = runHook(input, { PLAN_EVOLUTION_GUARD: 'off' });

    // Should have audit log in stderr
    assertMatch(result.stderr, /security_override/i, 'Should audit log security override');
  });
});

// ============================================================================
// RUN TESTS
// ============================================================================

console.log('\n========================================');
console.log('Plan Evolution Guard Tests');
console.log('========================================');

// Check if hook file exists
if (!fs.existsSync(HOOK_PATH)) {
  console.error(`\nERROR: Hook file not found at ${HOOK_PATH}`);
  console.error('Create the hook first, then run tests.\n');
  process.exit(1);
}

// Run all tests
try {
  // Tests are run automatically via describe/it calls above
} finally {
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`  - ${r.name}`);
        console.log(`    ${r.error}`);
      });
    process.exit(1);
  }
}
