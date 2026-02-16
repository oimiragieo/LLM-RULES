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
const PLANNER_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'planner-first-loop-state.json'
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
  let plannerLoopStateBackup = null;
  let originalEnv = {};

  beforeEach(() => {
    clearAllCache();
    // Backup state files
    routerStateBackup = backupState(ROUTER_STATE_FILE);
    loopStateBackup = backupState(LOOP_STATE_FILE);
    tasklistLoopStateBackup = backupState(TASKLIST_LOOP_STATE_FILE);
    plannerLoopStateBackup = backupState(PLANNER_LOOP_STATE_FILE);

    // Backup environment
    originalEnv = {
      ROUTER_SELF_CHECK: process.env.ROUTER_SELF_CHECK,
      PLANNER_FIRST_ENFORCEMENT: process.env.PLANNER_FIRST_ENFORCEMENT,
      SECURITY_REVIEW_ENFORCEMENT: process.env.SECURITY_REVIEW_ENFORCEMENT,
      LOOP_PREVENTION_MODE: process.env.LOOP_PREVENTION_MODE,
      TASK_REQUIRE_CORE_MEMORY_READ: process.env.TASK_REQUIRE_CORE_MEMORY_READ,
      CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
      TASK_RESUME_ENFORCEMENT: process.env.TASK_RESUME_ENFORCEMENT,
      TASK_ALLOW_AGENT_RESUME: process.env.TASK_ALLOW_AGENT_RESUME,
      TASK_SINGLE_PURPOSE_ENFORCEMENT: process.env.TASK_SINGLE_PURPOSE_ENFORCEMENT,
      PLANNER_FIRST_LOOP_BREAKER_THRESHOLD: process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD,
      PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS: process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS,
    };

    // Clean environment
    delete process.env.ROUTER_SELF_CHECK;
    delete process.env.PLANNER_FIRST_ENFORCEMENT;
    delete process.env.SECURITY_REVIEW_ENFORCEMENT;
    delete process.env.LOOP_PREVENTION_MODE;
    delete process.env.TASK_REQUIRE_CORE_MEMORY_READ;
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.TASK_RESUME_ENFORCEMENT;
    delete process.env.TASK_ALLOW_AGENT_RESUME;
    delete process.env.TASK_SINGLE_PURPOSE_ENFORCEMENT;
    delete process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD;
    delete process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS;

    // Invalidate all caches before each test
    preTaskUnified.invalidateCachedState();
    restoreState(PLANNER_LOOP_STATE_FILE, null);
  });

  afterEach(() => {
    // Restore state files
    restoreState(ROUTER_STATE_FILE, routerStateBackup);
    restoreState(LOOP_STATE_FILE, loopStateBackup);
    restoreState(TASKLIST_LOOP_STATE_FILE, tasklistLoopStateBackup);
    restoreState(PLANNER_LOOP_STATE_FILE, plannerLoopStateBackup);

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

    it('should allow stale repeated action pattern outside recency window', () => {
      const staleTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      writeState(LOOP_STATE_FILE, {
        sessionId: 'test-session',
        spawnDepth: 1,
        actionHistory: [{ action: 'spawn:developer', count: 9, lastAt: staleTime }],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are DEVELOPER. Continue with the next task.',
        },
      };

      const result = preTaskUnified.checkLoopPrevention(input);
      assert.strictEqual(result.pass, true);
    });

    it('should ignore malformed/empty session state and allow fresh run', () => {
      process.env.CLAUDE_SESSION_ID = 'current-session';
      writeState(LOOP_STATE_FILE, {
        sessionId: '',
        spawnDepth: 99,
        actionHistory: [{ action: 'spawn:qa', count: 12, lastAt: new Date().toISOString() }],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are QA. Run reliability checks.',
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

    it('should ignore stale loop state from a different session', () => {
      process.env.CLAUDE_SESSION_ID = 'current-session';

      writeState(LOOP_STATE_FILE, {
        sessionId: 'previous-session',
        spawnDepth: 7,
        actionHistory: [
          { action: 'spawn:code-reviewer', count: 9, lastAt: new Date().toISOString() },
        ],
      });

      const input = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'You are CODE-REVIEWER. Run scan wave 1.',
          description: 'Code quality bug scan',
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
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';

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

      const router = readState(ROUTER_STATE_FILE);
      assert.ok(router.currentSpawnTaskId == null);
    });

    it('should record in_progress lifecycle when task_id is provided', () => {
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';

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
          task_id: 'task-lifecycle-1',
          prompt: 'You are DEVELOPER. Fix a simple bug.',
          description: 'Developer fixing bug',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, true);

      const router = readState(ROUTER_STATE_FILE);
      assert.strictEqual(router.currentSpawnTaskId, 'task-lifecycle-1');
      assert.strictEqual(router.lastTaskUpdateTaskId, 'task-lifecycle-1');
      assert.strictEqual(router.lastTaskUpdateStatus, 'in_progress');
      assert.ok(Number(router.taskUpdatesThisSession || 0) >= 1);
    });

    it('should stop on first failure', () => {
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';

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
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';

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

    it('should block resume-style Task spawns by default', () => {
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
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
          prompt: 'Resuming a1ae150 and continuing previous developer run.',
          description: 'resume developer execution',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('Resume-style spawn detected'));
    });

    it('should allow resume-style spawn when override is explicitly enabled', () => {
      process.env.TASK_ALLOW_AGENT_RESUME = 'true';
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off'; // Disable memory read requirement
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
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
          prompt: 'Resuming a1ae150 and continuing previous developer run.',
          description: 'resume developer execution',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, true);
    });

    it('should block multi-wave spawn prompts in single-purpose block mode', () => {
      process.env.TASK_SINGLE_PURPOSE_ENFORCEMENT = 'block';
      process.env.TASK_REQUIRE_CORE_MEMORY_READ = 'off'; // Disable memory read requirement
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
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
          prompt: 'Tier 1: patch hooks. Wave 2: run remediation pass.',
          description: 'phase 1 then phase 2',
        },
      };

      const result = preTaskUnified.runAllChecks(input);
      assert.strictEqual(result.pass, false);
      assert.ok(result.message.includes('Multi-wave task'));
    });
  });
});
