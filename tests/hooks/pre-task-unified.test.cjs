#!/usr/bin/env node
/**
 * Tests for pre-task-unified.cjs
 *
 * Consolidation of 3 PreToolUse(Task) hooks:
 * 1. agent-context-pre-tracker.cjs - Sets mode='agent' before task starts
 * 2. routing-guard.cjs - Planner-first, security review, router self-check
 * 3. loop-prevention.cjs - Prevents runaway loops
 *
 * Run with: node --test .claude/hooks/routing/pre-task-unified.test.cjs
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { clearAllCache } = require('../../.claude/lib/utils/state-cache.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Prevent process.exit from actually exiting during tests
const originalExit = process.exit;
let lastExitCode = null; // eslint-disable-line no-unused-vars
process.exit = code => {
  lastExitCode = code;
};

// Import the unified hook module (will fail until implemented)
const preTaskUnified = require('../../.claude/hooks/routing/pre-task-unified.cjs');

// Restore process.exit after imports
process.exit = originalExit;

// Test helpers
const ROUTER_STATE_FILE = routerState.STATE_FILE;
const LOOP_STATE_FILE = preTaskUnified.LOOP_STATE_FILE;
const TASKLIST_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tasklist-first-loop-state.json'
);

function backupState(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
}

function restoreState(filePath, content) {
  if (content === null) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

function writeState(filePath, state) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

function readState(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ===========================================================================
// Test Suite
// ===========================================================================

describe('pre-task-unified.cjs', () => {
  let routerStateBackup = null;
  let loopStateBackup = null;
  let tasklistLoopStateBackup = null;
  let originalEnv = {};

  beforeEach(() => {
    clearAllCache();
    // Backup state files
    routerStateBackup = backupState(ROUTER_STATE_FILE);
    loopStateBackup = backupState(LOOP_STATE_FILE);
    tasklistLoopStateBackup = backupState(TASKLIST_LOOP_STATE_FILE);

    // Backup environment
    originalEnv = {
      ROUTER_SELF_CHECK: process.env.ROUTER_SELF_CHECK,
      PLANNER_FIRST_ENFORCEMENT: process.env.PLANNER_FIRST_ENFORCEMENT,
      SECURITY_REVIEW_ENFORCEMENT: process.env.SECURITY_REVIEW_ENFORCEMENT,
      LOOP_PREVENTION_MODE: process.env.LOOP_PREVENTION_MODE,
      CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
    };

    // Clean environment
    delete process.env.ROUTER_SELF_CHECK;
    delete process.env.PLANNER_FIRST_ENFORCEMENT;
    delete process.env.SECURITY_REVIEW_ENFORCEMENT;
    delete process.env.LOOP_PREVENTION_MODE;
    delete process.env.CLAUDE_SESSION_ID;

    // Invalidate all caches before each test
    preTaskUnified.invalidateCachedState();
  });

  afterEach(() => {
    // Restore state files
    restoreState(ROUTER_STATE_FILE, routerStateBackup);
    restoreState(LOOP_STATE_FILE, loopStateBackup);
    restoreState(TASKLIST_LOOP_STATE_FILE, tasklistLoopStateBackup);

    // Restore environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Invalidate caches after each test
    preTaskUnified.invalidateCachedState();
    clearAllCache();
  });

  // ---------------------------------------------------------------------------
  // Module Exports Tests
  // ---------------------------------------------------------------------------

  describe('exports', () => {
    it('should export runAllChecks function', () => {
      assert.strictEqual(typeof preTaskUnified.runAllChecks, 'function');
    });

    it('should export check functions from each consolidated hook', () => {
      // From agent-context-pre-tracker
      assert.strictEqual(typeof preTaskUnified.checkAgentContextPreTracker, 'function');
      // From routing-guard
      assert.strictEqual(typeof preTaskUnified.checkRoutingGuard, 'function');
      // From loop-prevention
      assert.strictEqual(typeof preTaskUnified.checkLoopPrevention, 'function');
    });

    it('should export main function', () => {
      assert.strictEqual(typeof preTaskUnified.main, 'function');
    });
  });

  // ---------------------------------------------------------------------------
  // Agent Context Pre-Tracker Tests (from agent-context-pre-tracker.cjs)
  // ---------------------------------------------------------------------------

  describe('checkAgentContextPreTracker', () => {
    it('should always pass and set agent mode', () => {
      // Reset to router mode first
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        taskSpawned: false,
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix the bug.',
          description: 'Developer fixing login bug',
        },
      };

      const result = preTaskUnified.checkAgentContextPreTracker(input);

      // Should always pass (tracking only)
      assert.strictEqual(result.pass, true);
    });

    it('should extract task description from prompt', () => {
      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix the login bug in authentication module.',
        },
      };

      const result = preTaskUnified.checkAgentContextPreTracker(input);
      assert.strictEqual(result.pass, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Routing Guard Tests (from routing-guard.cjs)
  // ---------------------------------------------------------------------------

  describe('checkRoutingGuard', () => {
    it('should pass for Task tool when planner not required', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
        plannerSpawned: false,
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix a simple bug.',
        },
      };

      const result = preTaskUnified.checkRoutingGuard('Task', input.tool_input);
      assert.strictEqual(result.pass, true);
    });

    it('should block Task when planner required but not spawned', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Implement complex feature.',
        },
      };

      const result = preTaskUnified.checkRoutingGuard('Task', input.tool_input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('PLANNER'));
    });

    it('should pass when spawning PLANNER agent', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are PLANNER. Design the feature.',
          description: 'Planner designing feature',
        },
      };

      const result = preTaskUnified.checkRoutingGuard('Task', input.tool_input);
      assert.strictEqual(result.pass, true);
    });

    it('should pass when security required and spawning security-architect', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresSecurityReview: true,
        securitySpawned: false,
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are SECURITY-ARCHITECT. Review auth implementation.',
          description: 'Security reviewing auth',
        },
      };

      const result = preTaskUnified.checkRoutingGuard('Task', input.tool_input);
      assert.strictEqual(result.pass, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Loop Prevention Tests (from loop-prevention.cjs)
  // ---------------------------------------------------------------------------

  describe('checkLoopPrevention', () => {
    it('should pass for first spawn', () => {
      writeState(LOOP_STATE_FILE, {
        sessionId: 'test-session',
        evolutionCount: 0,
        lastEvolutions: {},
        spawnDepth: 0,
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix the bug.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, true);
    });

    it('should block when spawn depth exceeds limit', () => {
      writeState(LOOP_STATE_FILE, {
        sessionId: 'test-session',
        spawnDepth: 10, // Exceeds default of 5
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix the bug.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('depth'));
    });

    it('should block when action pattern repeats too many times', () => {
      writeState(LOOP_STATE_FILE, {
        sessionId: 'test-session',
        spawnDepth: 1,
        actionHistory: [{ action: 'spawn:developer', count: 5, lastAt: new Date().toISOString() }],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix another bug.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('pattern') || result.message.includes('Pattern'));
    });

    it('should allow repeated action pattern for sequential non-nested spawns', () => {
      writeState(LOOP_STATE_FILE, {
        sessionId: 'test-session',
        spawnDepth: 0,
        actionHistory: [{ action: 'spawn:developer', count: 8, lastAt: new Date().toISOString() }],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Handle next queued task.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      process.env.LOOP_PREVENTION_MODE = 'off';

      writeState(LOOP_STATE_FILE, {
        spawnDepth: 100, // Would normally block
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Combined runAllChecks Tests
  // ---------------------------------------------------------------------------

  describe('runAllChecks', () => {
    it('should run all 3 checks in order', () => {
      // Set up clean state
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
        plannerSpawned: false,
        requiresSecurityReview: false,
        taskListCalledSincePrompt: true,
      });

      writeState(LOOP_STATE_FILE, {
        spawnDepth: 0,
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix a simple bug.',
          description: 'Developer fixing bug',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, true);

      const loopState = readState(LOOP_STATE_FILE);
      assert.ok(loopState, 'expected loop-state.json to exist');
      assert.strictEqual(loopState.spawnDepth, 1);
      assert.strictEqual(loopState.evolutionCount, 0);
      assert.ok(
        Array.isArray(loopState.actionHistory) &&
          loopState.actionHistory.some(e => e.action === 'spawn:developer' && e.count === 1)
      );
    });

    it('should stop on first failure', () => {
      // Set up state that will fail routing-guard check
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
        taskListCalledSincePrompt: true,
      });

      writeState(LOOP_STATE_FILE, {
        spawnDepth: 0,
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Implement complex feature.',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('PLANNER'));
    });

    it('should check loop prevention last', () => {
      // Set up state that passes all but loop-prevention
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
        taskListCalledSincePrompt: true,
      });

      writeState(LOOP_STATE_FILE, {
        spawnDepth: 10, // Exceeds limit
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix a bug.',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('depth') || result.message.includes('loop'));
    });

    it('should pass for non-Task tools', () => {
      const input = {
        tool_name: 'Read',
        tool_input: {
          file_path: 'test.txt',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, true);
    });
  });

  describe('TaskList-first loop-breaker', () => {
    it('should warn-allow by default when TASKLIST_FIRST_ENFORCEMENT is unset', () => {
      process.env.CLAUDE_SESSION_ID = 'tasklist-default-warn-test';
      delete process.env.TASKLIST_FIRST_ENFORCEMENT;

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        taskListCalledSincePrompt: false,
      });

      const result = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-default-warn-test',
      });

      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.ok(result.message.includes('TaskList() must be called before Task()'));

      preTaskUnified.clearTaskListFirstViolation('tasklist-default-warn-test');
    });

    it('should block initial TaskList-first violations, then warn-allow repeated loops', () => {
      process.env.CLAUDE_SESSION_ID = 'tasklist-loop-test';
      process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        taskListCalledSincePrompt: false,
      });

      const first = preTaskUnified.checkTaskListFirst('Task', { session_id: 'tasklist-loop-test' });
      assert.strictEqual(first.pass, false);
      assert.strictEqual(first.result, 'block');

      const second = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-loop-test',
      });
      assert.strictEqual(second.pass, false);
      assert.strictEqual(second.result, 'block');

      const third = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-loop-test',
      });
      assert.strictEqual(third.pass, true);
      assert.strictEqual(third.result, 'warn');
      assert.ok(third.message.includes('LOOP-BREAKER'));

      preTaskUnified.clearTaskListFirstViolation('tasklist-loop-test');
    });
  });

  // ---------------------------------------------------------------------------
  // Exit Code Tests
  // ---------------------------------------------------------------------------

  describe('exit codes', () => {
    it('should return exit code 0 when all checks pass', () => {
      process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';
      process.env.PLANNER_FIRST_ENFORCEMENT = 'off';
      process.env.SECURITY_REVIEW_ENFORCEMENT = 'off';
      process.env.LOOP_PREVENTION_MODE = 'off';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
        taskListCalledSincePrompt: true,
      });

      writeState(LOOP_STATE_FILE, {
        spawnDepth: 0,
        actionHistory: [],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Fix a bug.',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should return exit code 2 when check fails in block mode', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
        taskListCalledSincePrompt: true,
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER.',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.exitCode, 2);
    });
  });
});
