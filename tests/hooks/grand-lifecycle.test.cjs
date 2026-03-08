#!/usr/bin/env node
/**
 * Grand Integration Test: Subagent Lifecycle (TDD 1.2)
 *
 * Simulates the full lifecycle of a subagent:
 * 1. Router Spawns Agent (PreTaskUnified)
 * 2. Agent calls TaskList (Satisfy gate)
 * 3. Agent calls TaskUpdate(in_progress) (Record work)
 * 4. Agent calls Read (Should be allowed)
 * 5. Agent calls TaskUpdate(completed) (Advance workflow)
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const PRE_TASK_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'pre-task-unified.cjs'
);
const PRE_TOOL_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'pre-tool-unified.cjs'
);
const POST_TASK_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'post-task-unified.cjs'
);
const POST_COMPLETION_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'workflow',
  'post-completion-chain.cjs'
);

const TEST_DIR = path.join(PROJECT_ROOT, '.claude', 'tmp', 'lifecycle-test');
const ROUTER_STATE = path.join(TEST_DIR, 'router-state.json');
const TASK_STATUS = path.join(TEST_DIR, 'task-status.json');
const WF_STATE = path.join(TEST_DIR, 'workflow-state.json');
const PHASE_SIGNAL = path.join(TEST_DIR, 'phase-advance.json');

async function runHook(hookPath, input, env = {}) {
  const child = spawn(process.execPath, [hookPath, JSON.stringify(input)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      ROUTER_STATE_FILE: ROUTER_STATE,
      TASK_STATUS_FILE: TASK_STATUS,
      WORKFLOW_STATE_FILE: WF_STATE,
      PHASE_ADVANCE_FILE: PHASE_SIGNAL,
      REFLECTION_ENABLED: 'false',
    },
  });

  let stdout = '';
  child.stdout.on('data', d => (stdout += d));
  let stderr = '';
  child.stderr.on('data', d => (stderr += d));

  const code = await new Promise(r => child.on('close', r));
  return { code, stdout, stderr };
}

async function testLifecycle() {
  console.log('--- Grand Subagent Lifecycle Test ---');

  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const taskId = 'task-lifecycle-42';
  const sessionId = 'session-lifecycle-99';

  // 1. Setup initial workflow state
  const dummyPlan = path.join(PROJECT_ROOT, '.claude', 'tmp', 'dummy-plan-lifecycle.md');
  if (!fs.existsSync(path.dirname(dummyPlan)))
    fs.mkdirSync(path.dirname(dummyPlan), { recursive: true });
  fs.writeFileSync(dummyPlan, '# Dummy Plan');

  const initialState = {
    workflowId: 'wf-lifecycle',
    currentPhase: 'validate',
    phases: {
      validate: {
        status: 'in_progress',
        agents: { developer: { taskId, status: 'in_progress' } },
      },
      obtain: {
        status: 'pending',
      },
    },
  };
  fs.writeFileSync(WF_STATE, JSON.stringify(initialState));

  // STEP 0: Router calls TaskList (Satisfy gate for Router)
  console.log('Step 0: Router calling TaskList...');
  const routerListInput = {
    tool_name: 'TaskList',
    tool_input: {},
    session_id: 'router-session',
  };
  await runHook(POST_TASK_HOOK, routerListInput);

  // STEP 1: Router Spawns Agent (PreTaskUnified)
  console.log('Step 1: Router spawning agent...');
  const spawnInput = {
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'developer',
      task_id: taskId,
      prompt: 'Build the thing',
    },
    session_id: 'router-session',
  };
  const res1 = await runHook(PRE_TASK_HOOK, spawnInput, {
    TASK_REQUIRE_CORE_MEMORY_READ: 'off',
    LOOP_PREVENTION_MODE: 'off',
    CONCURRENT_AGENT_CAP_ENFORCEMENT: 'off',
    NESTED_WORKTREE_ENFORCEMENT: 'off',
  });
  if (res1.code !== 0) throw new Error(`Spawn blocked: ${res1.stderr || res1.stdout}`);

  // STEP 2: Agent calls TaskList (Satisfy gate)
  console.log('Step 2: Agent calling TaskList...');
  const listInput = {
    tool_name: 'TaskList',
    tool_input: {},
    session_id: sessionId,
    allowed_tools: ['TaskUpdate', 'Read'],
  };
  const res2 = await runHook(PRE_TOOL_HOOK, listInput);
  if (res2.code !== 0) throw new Error(`TaskList blocked: ${res2.stderr || res2.stdout}`);

  // STEP 3: Agent calls TaskUpdate(in_progress)
  console.log('Step 3: Agent calling TaskUpdate(in_progress)...');
  const updateInput = {
    tool_name: 'TaskUpdate',
    tool_input: { taskId, status: 'in_progress' },
    session_id: sessionId,
    allowed_tools: ['TaskUpdate', 'Read'],
  };
  const res3 = await runHook(PRE_TOOL_HOOK, updateInput);
  if (res3.code !== 0)
    throw new Error(`TaskUpdate(in_progress) blocked: ${res3.stderr || res3.stdout}`);

  // STEP 4: Agent calls Read (Should be allowed)
  console.log('Step 4: Agent calling Read...');
  const readInput = {
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
    session_id: sessionId,
    allowed_tools: ['TaskUpdate', 'Read'],
  };
  const res4 = await runHook(PRE_TOOL_HOOK, readInput);
  if (res4.code !== 0) throw new Error(`Read blocked: ${res4.stderr || res4.stdout}`);

  // STEP 5: Agent calls TaskUpdate(completed)
  console.log('Step 5: Agent calling TaskUpdate(completed)...');
  const completeInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId,
      status: 'completed',
      metadata: { summary: 'Done', testsPassing: true, testsAdded: true },
    },
    session_id: sessionId,
    allowed_tools: ['TaskUpdate', 'Read'],
  };

  // PostToolUse triggers workflow advance
  const res5 = await runHook(POST_COMPLETION_HOOK, completeInput);
  if (res5.stderr) console.error(res5.stderr);
  if (res5.code !== 0) throw new Error(`PostCompletion failed: ${res5.stderr || res5.stdout}`);

  // Verify Phase Advance
  const finalState = JSON.parse(fs.readFileSync(WF_STATE, 'utf8'));
  console.log(`Current Phase: ${finalState.currentPhase}`);
  if (finalState.currentPhase !== 'obtain') {
    throw new Error(`Workflow did not advance! Phase is still ${finalState.currentPhase}`);
  }

  console.log('\n[PASS] Grand Subagent Lifecycle Test successful.');
}

testLifecycle().catch(err => {
  console.error(`
[FAIL] ${err.message}`);
  process.exit(1);
});
