#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Path to the real budget tracker
const budgetTrackerPath = require.resolve(path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'token-budget-tracker.cjs'));

// Prepare a mock that we can manipulate
let mockBudgetStatus = null;
require.cache[budgetTrackerPath] = {
  id: budgetTrackerPath,
  filename: budgetTrackerPath,
  loaded: true,
  exports: {
    checkBudgetStatus: () => mockBudgetStatus,
  }
};

// Now require the hook script - it will use our mocked token-budget-tracker
const hookPath = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'pre-tool-unified.execution.cjs');
// Force clear the cache just in case
delete require.cache[require.resolve(hookPath)];
const { checkExecutionLimit } = require(hookPath);

test('Token Guard allows tools when tokens are BELOW the safe limit (< 180k)', () => {
  mockBudgetStatus = { used: 150000 }; // 150k
  const result = checkExecutionLimit({ session_id: 'test' }, 'Bash', {});
  
  // It shouldn't block for context pressure
  if (result && result.action === 'block') {
    assert.ok(!result.message.includes('[SYSTEM URGENT] Context pressure'), 'Should not block with urgent token message');
  } else {
    assert.ok(true);
  }
});

test('Token Guard BLOCKS tools with SYSTEM URGENT when tokens exceed 180k and EXTRA_USAGE_ENABLED is false', () => {
  mockBudgetStatus = { used: 185000 }; // 185k
  process.env.EXTRA_USAGE_ENABLED = 'false';
  
  const result = checkExecutionLimit({ session_id: 'test' }, 'Bash', {});
  
  assert.strictEqual(result.action, 'block', 'Execution must be blocked');
  assert.ok(result.message.includes('[SYSTEM URGENT] Context pressure > 180k tokens'), 'Must enforce 180k constraint');
});

test('Token Guard PERMITS critical lifecycle tools (TaskOutput, TaskList, TaskUpdate) even when tokens exceed 180k', () => {
  mockBudgetStatus = { used: 185000 }; // 185k
  process.env.EXTRA_USAGE_ENABLED = 'false';
  
  const result = checkExecutionLimit({ session_id: 'test' }, 'TaskOutput', {});
  
  // It shouldn't block for context pressure
  if (result && result.action === 'block') {
    assert.ok(!result.message.includes('[SYSTEM URGENT] Context pressure'), 'Must NOT block lifecycle tools');
  } else {
    assert.ok(true);
  }
});

test('Token Guard limits Opus context to 180k when EXTRA_USAGE_ENABLED is not set (Anthropic API Default)', () => {
  mockBudgetStatus = { used: 185000 }; // 185k
  delete process.env.EXTRA_USAGE_ENABLED;
  
  const result = checkExecutionLimit({ session_id: 'test' }, 'Bash', {});
  
  assert.strictEqual(result.action, 'block', 'Execution must be blocked despite Opus model');
  assert.ok(result.message.includes('[SYSTEM URGENT] Context pressure > 180k tokens'), 'Must enforce 180k constraint by default');
});
