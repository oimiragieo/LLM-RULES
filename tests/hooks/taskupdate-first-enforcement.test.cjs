#!/usr/bin/env node
/**
 * Test: TaskUpdate mandatory first action (TDD 2.1)
 * 
 * Verifies that a subagent cannot call a tool like 'Read'
 * before calling 'TaskUpdate(in_progress)'.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { checkTaskUpdateFirst } = require('../../.claude/hooks/routing/pre-tool-unified.taskupdate.cjs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const TEST_STATE = path.join(PROJECT_ROOT, '.claude', 'tmp', 'taskupdate-first-test.json');

async function testTaskUpdateFirst() {
  console.log('--- TaskUpdate-First Enforcement Tests ---');

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

  if (fs.existsSync(TEST_STATE)) fs.unlinkSync(TEST_STATE);

  await test('should block Read before TaskUpdate(in_progress)', () => {
    const hookInput = {
      session_id: 'session-strict-1',
      allowed_tools: ['TaskUpdate', 'Read'],
      task_id: 'task-1'
    };
    
    // Attempt Read as first tool
    const res = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'test.txt' }, TEST_STATE);
    
    if (res.action !== 'block') {
      throw new Error(`Read was allowed without TaskUpdate! Action: ${res.action}, Warning: ${res.warning}`);
    }
    if (!res.message.includes('Only TaskList() and TaskUpdate() are allowed')) {
      throw new Error(`Unexpected block message: ${res.message}`);
    }
  });

  await test('should allow Read after TaskUpdate(in_progress)', () => {
    const hookInput = {
      session_id: 'session-strict-2',
      allowed_tools: ['TaskUpdate', 'Read'],
      task_id: 'task-2'
    };
    
    // 1. Call TaskUpdate
    checkTaskUpdateFirst(hookInput, 'TaskUpdate', { taskId: 'task-2', status: 'in_progress' }, TEST_STATE);
    
    // 2. Attempt Read
    const res = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'test.txt' }, TEST_STATE);
    
    if (res.action !== 'allow') {
      throw new Error(`Read was blocked after TaskUpdate! Reason: ${res.message || res.reason}`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testTaskUpdateFirst();
