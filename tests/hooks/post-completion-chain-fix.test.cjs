#!/usr/bin/env node
/**
 * Test: Post-completion chain integration
 *
 * Verifies that TaskUpdate(completed) triggers workflow phase advancement.
 * Uses the processTaskCompletion API directly (no child process needed).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  processTaskCompletion,
  WORKFLOW_STATE_FILE,
  PHASE_ADVANCE_FILE,
} = require('../../.claude/hooks/workflow/post-completion-chain.cjs');

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

  if (fs.existsSync(WORKFLOW_STATE_FILE)) fs.unlinkSync(WORKFLOW_STATE_FILE);
  if (fs.existsSync(PHASE_ADVANCE_FILE)) fs.unlinkSync(PHASE_ADVANCE_FILE);

  await test('should advance workflow phase on completion', async () => {
    const taskId = 'task-42';

    // 1. Setup initial workflow state with EVOLVE phases
    const initialState = {
      workflowId: 'wf-test',
      currentPhase: 'evaluate',
      phases: {
        evaluate: {
          status: 'in_progress',
          agents: {
            planner: {
              taskId: taskId,
              status: 'in_progress',
            },
          },
        },
        validate: {
          status: 'pending',
        },
      },
    };
    fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
    fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(initialState));

    // 2. Simulate completion via processTaskCompletion
    await processTaskCompletion({
      toolUse: {
        tool: 'TaskUpdate',
        input: {
          taskId,
          status: 'completed',
          metadata: { summary: 'Design complete' },
        },
      },
    });

    // 3. Verify state update
    const state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
    if (state.phases.evaluate.status !== 'completed') {
      throw new Error(`Expected phase status completed, got ${state.phases.evaluate.status}`);
    }
    if (state.phases.evaluate.agents.planner.status !== 'completed') {
      throw new Error(
        `Expected agent status completed, got ${state.phases.evaluate.agents.planner.status}`
      );
    }

    // 4. Verify signal creation
    if (!fs.existsSync(PHASE_ADVANCE_FILE)) {
      throw new Error('Phase advance signal was not created');
    }
    const signal = JSON.parse(fs.readFileSync(PHASE_ADVANCE_FILE, 'utf8'));
    if (signal.advanceTo !== 'validate') {
      throw new Error(`Expected advanceTo validate, got ${signal.advanceTo}`);
    }
  });

  // Cleanup
  if (fs.existsSync(WORKFLOW_STATE_FILE)) fs.unlinkSync(WORKFLOW_STATE_FILE);
  if (fs.existsSync(PHASE_ADVANCE_FILE)) fs.unlinkSync(PHASE_ADVANCE_FILE);

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testPostCompletion();
