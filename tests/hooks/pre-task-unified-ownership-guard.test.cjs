#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const preTaskUnified = require('../../.claude/hooks/routing/pre-task-unified.cjs');
const taskClaimLedger = require('../../.claude/lib/routing/task-claim-ledger.cjs');

const ROUTER_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'router-state.json'
);

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function restoreFile(filePath, content) {
  if (content === null) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeRouterState(state) {
  fs.mkdirSync(path.dirname(ROUTER_STATE_FILE), { recursive: true });
  fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

describe('pre-task-unified ownership guard', () => {
  let ledgerBackup = null;
  let routerStateBackup = null;
  let envBackup = {};

  beforeEach(() => {
    ledgerBackup = backupFile(taskClaimLedger.LEDGER_FILE);
    routerStateBackup = backupFile(ROUTER_STATE_FILE);
    envBackup = { ...process.env };
    taskClaimLedger.clearLedger();
    preTaskUnified.invalidateCachedState();
    writeRouterState({
      mode: 'router',
      requiresPlannerFirst: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';
    process.env.PLANNER_FIRST_ENFORCEMENT = 'off';
    process.env.SECURITY_REVIEW_ENFORCEMENT = 'off';
    process.env.LOOP_PREVENTION_MODE = 'off';
    process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';
    process.env.TASK_OWNERSHIP_GUARD = 'block';
    process.env.TASK_PARALLEL_OWNERSHIP_REQUIRED = 'block';
  });

  afterEach(() => {
    restoreFile(taskClaimLedger.LEDGER_FILE, ledgerBackup);
    restoreFile(ROUTER_STATE_FILE, routerStateBackup);
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
    preTaskUnified.invalidateCachedState();
  });

  it('blocks parallel task spawn when ownership overlaps active claim', () => {
    preTaskUnified.registerTaskOwnershipClaimAfterAllow({
      session_id: 'session-a',
      tool_input: {
        task_id: 'task-1',
        subagent_type: 'developer',
        allowed_files: ['src/auth'],
      },
    });

    const result = preTaskUnified.checkTaskOwnershipConflicts({
      task_id: 'task-2',
      owned_paths: ['src/auth/login'],
      subagent_type: 'qa',
    });

    assert.equal(result.pass, false);
    assert.equal(result.result, 'block');
    assert.match(result.message, /OWNERSHIP-CONFLICT/);
  });

  it('allows parallel spawn when ownership paths are disjoint', () => {
    preTaskUnified.registerTaskOwnershipClaimAfterAllow({
      session_id: 'session-a',
      tool_input: {
        task_id: 'task-1',
        subagent_type: 'developer',
        allowed_files: ['src/auth'],
      },
    });

    const result = preTaskUnified.checkTaskOwnershipConflicts({
      task_id: 'task-2',
      owned_paths: ['src/payments'],
      subagent_type: 'qa',
    });

    assert.equal(result.pass, true);
  });

  it('records beads-style dependency metadata in task claim ledger', () => {
    preTaskUnified.registerTaskOwnershipClaimAfterAllow({
      session_id: 'session-b',
      tool_input: {
        task_id: 'task-7',
        subagent_type: 'planner',
        allowed_files: ['src/planner'],
        depends_on: ['task-5'],
        dependency_type: 'related',
      },
    });

    const ledger = taskClaimLedger.readLedger();
    const claim = ledger.claims['task-7'];
    assert.ok(claim);
    assert.deepEqual(claim.dependsOn, ['task-5']);
    assert.equal(claim.dependencyType, 'related');
  });

  it('runAllChecks registers ownership claim after allowed spawn', () => {
    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      session_id: 'session-c',
      tool_input: {
        task_id: 'task-11',
        subagent_type: 'developer',
        prompt: 'ALLOWED_FILES: src/worker',
      },
    });

    assert.equal(result.pass, true);
    const active = taskClaimLedger.getActiveClaims();
    const match = active.find(claim => claim.taskId === 'task-11');
    assert.ok(match);
    assert.deepEqual(match.ownedPaths, ['src/worker']);
  });

  it('blocks MEDIUM+ parallel spawn when ownership metadata is missing', () => {
    writeRouterState({
      mode: 'router',
      complexity: 'medium',
      requiresPlannerFirst: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });

    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      session_id: 'session-d',
      tool_input: {
        task_id: 'task-22',
        subagent_type: 'developer',
        parallel_group: 'pg-1',
      },
    });

    assert.equal(result.pass, false);
    assert.equal(result.exitCode, 2);
    assert.match(result.message, /PARALLEL-OWNERSHIP-REQUIRED/);
  });

  it('allows MEDIUM+ parallel spawn when owned_paths exists', () => {
    writeRouterState({
      mode: 'router',
      complexity: 'high',
      requiresPlannerFirst: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });

    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      session_id: 'session-e',
      tool_input: {
        task_id: 'task-23',
        subagent_type: 'developer',
        parallel_group: 'pg-2',
        owned_paths: ['src/payments'],
      },
    });

    assert.equal(result.pass, true);
  });

  it('does not enforce ownership requirement for low complexity parallel spawn', () => {
    writeRouterState({
      mode: 'router',
      complexity: 'low',
      requiresPlannerFirst: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });

    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      session_id: 'session-f',
      tool_input: {
        task_id: 'task-24',
        subagent_type: 'developer',
        parallel_group: 'pg-3',
      },
    });

    assert.equal(result.pass, true);
  });
});
