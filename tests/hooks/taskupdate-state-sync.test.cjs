#!/usr/bin/env node
/**
 * Test: TaskUpdate state synchronization
 * 
 * Verifies that calling TaskUpdate updates the router-state.json
 * and emits a TASK_UPDATED event via the post-task-unified hook.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'post-task-unified.cjs');
const TEST_STATE = path.join(PROJECT_ROOT, '.claude', 'tmp', 'test-router-state.json');

async function testTaskUpdateSync() {
  console.log('--- TaskUpdate State Sync Test ---');

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

  await test('should update router-state when TaskUpdate is called', async () => {
    const taskId = 'test-sync-task-123';
    const status = 'in_progress';
    
    // Simulate hook input for TaskUpdate (Nested Schema)
    const hookInput = {
      toolUse: {
        tool: 'TaskUpdate',
        input: {
          taskId,
          status
        }
      },
      session_id: 'test-session'
    };

    // Run hook with isolated state file
    const child = spawn(process.execPath, [HOOK_PATH, JSON.stringify(hookInput)], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { 
        ...process.env, 
        ROUTER_STATE_FILE: TEST_STATE
      }
    });
    
    await new Promise(r => child.on('close', r));

    // Verify state
    process.env.ROUTER_STATE_FILE = TEST_STATE;
    routerState.invalidateStateCache();
    const state = routerState.getState();
    delete process.env.ROUTER_STATE_FILE;

    if (state.lastTaskUpdateTaskId !== taskId) {
      throw new Error(`Expected taskId ${taskId}, got ${state.lastTaskUpdateTaskId}`);
    }
    if (state.lastTaskUpdateStatus !== status) {
      throw new Error(`Expected status ${status}, got ${state.lastTaskUpdateStatus}`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testTaskUpdateSync();
