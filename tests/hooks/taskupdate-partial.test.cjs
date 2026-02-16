#!/usr/bin/env node
/**
 * Test: Partial TaskUpdate support (TDD 1.1)
 *
 * Verifies that TaskUpdate calls without a status field (partial updates)
 * are allowed by the contract validator and recorded in state.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  runValidation,
} = require('../../.claude/hooks/validation/taskupdate-contract-validator.cjs');
const {
  checkTaskUpdateFirst,
} = require('../../.claude/hooks/routing/pre-tool-unified.taskupdate.cjs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const TEST_STATE = path.join(PROJECT_ROOT, '.claude', 'tmp', 'partial-taskupdate-test.json');

async function testPartialUpdate() {
  console.log('--- Partial TaskUpdate Tests ---');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('contract validator should allow missing status', () => {
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-1',
        metadata: { progress: '50%' },
      },
    };

    const result = runValidation(input);
    if (!result.allow) throw new Error(`Blocked: ${result.message}`);
  });

  await test('pre-tool hook should set inProgress for partial update', () => {
    if (fs.existsSync(TEST_STATE)) fs.unlinkSync(TEST_STATE);

    const hookInput = {
      session_id: 'test-session-partial',
      allowed_tools: ['TaskUpdate'],
    };

    // 1. Initial call (partial update)
    const res1 = checkTaskUpdateFirst(hookInput, 'TaskUpdate', { taskId: 'task-1' }, TEST_STATE);
    if (res1.action !== 'allow') throw new Error(`Initial update blocked: ${res1.message}`);

    // 2. Subsequent call to another tool (Read)
    const res2 = checkTaskUpdateFirst(hookInput, 'Read', {}, TEST_STATE);
    if (res2.action !== 'allow')
      throw new Error(`Subsequent tool blocked: ${res2.message || res2.reason}`);
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testPartialUpdate();
