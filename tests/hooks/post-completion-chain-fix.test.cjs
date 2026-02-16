#!/usr/bin/env node
/**
 * Test: Post-completion chain integration
 * 
 * Verifies that TaskUpdate(completed) triggers workflow phase advancement.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'workflow', 'post-completion-chain.cjs');
const TEST_STATE = path.join(PROJECT_ROOT, '.claude', 'tmp', 'test-wf-state.json');
const TEST_SIGNAL = path.join(PROJECT_ROOT, '.claude', 'tmp', 'test-phase-advance.json');

async function testPostCompletion() {
  console.log('--- Post-completion Chain Test ---');

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
  if (fs.existsSync(TEST_SIGNAL)) fs.unlinkSync(TEST_SIGNAL);

  await test('should advance workflow phase on completion', async () => {
    const taskId = 'task-42';
    
    // 1. Setup initial workflow state
    const dummyPlan = path.join(PROJECT_ROOT, '.claude', 'tmp', 'dummy-plan.md');
    fs.writeFileSync(dummyPlan, '# Dummy Plan');
    
    const initialState = {
      workflowId: 'wf-test',
      currentPhase: 'PHASE_1_DESIGN',
      artifacts: {
        implementationPlan: '.claude/tmp/dummy-plan.md'
      },
      phases: {
        PHASE_1_DESIGN: {
          status: 'in_progress',
          agents: {
            planner: {
              taskId: taskId,
              status: 'in_progress'
            }
          }
        }
      }
    };
    if (!fs.existsSync(path.dirname(TEST_STATE))) fs.mkdirSync(path.dirname(TEST_STATE), { recursive: true });
    fs.writeFileSync(TEST_STATE, JSON.stringify(initialState));

    // 2. Simulate completion hook input
    const hookInput = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed'
      }
    };

    // 3. Run hook
    const child = spawn(process.execPath, [HOOK_PATH, JSON.stringify(hookInput)], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { 
        ...process.env, 
        WORKFLOW_STATE_FILE: TEST_STATE,
        PHASE_ADVANCE_FILE: TEST_SIGNAL
      }
    });
    
    await new Promise(r => child.on('close', r));

    // 4. Verify state update
    const state = JSON.parse(fs.readFileSync(TEST_STATE, 'utf8'));
    if (state.phases.PHASE_1_DESIGN.status !== 'completed') {
      throw new Error(`Expected phase status completed, got ${state.phases.PHASE_1_DESIGN.status}`);
    }
    if (state.phases.PHASE_1_DESIGN.agents.planner.status !== 'completed') {
      throw new Error(`Expected agent status completed, got ${state.phases.PHASE_1_DESIGN.agents.planner.status}`);
    }

    // 5. Verify signal creation
    if (!fs.existsSync(TEST_SIGNAL)) {
      throw new Error('Phase advance signal was not created');
    }
    const signal = JSON.parse(fs.readFileSync(TEST_SIGNAL, 'utf8'));
    if (signal.advanceTo !== 'PHASE_2_IMPLEMENT') {
      throw new Error(`Expected advanceTo PHASE_2_IMPLEMENT, got ${signal.advanceTo}`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testPostCompletion();
