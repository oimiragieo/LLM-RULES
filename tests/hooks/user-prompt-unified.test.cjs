#!/usr/bin/env node
/**
 * Tests for user-prompt-unified.cjs
 *
 * This unified hook consolidates 5 UserPromptSubmit hooks:
 * 1. router-mode-reset.cjs - Resets router state on new prompts
 * 2. router-enforcer.cjs - Analyzes prompts for routing recommendations
 * 3. memory-reminder.cjs - Reminds agents to read memory files
 * 4. evolution-trigger-detector.cjs - Detects evolution trigger patterns
 * 5. memory-health-check.cjs - Checks memory system health
 *
 * TDD approach: Write tests first, then implement the unified hook.
 */

'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach, _mock } = require('node:test');
const path = require('path');
const fs = require('fs');

// Test file paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const _TEST_ROUTER_STATE = path.join(TEST_RUNTIME_DIR, 'router-state.json');
const _TEST_EVOLUTION_STATE = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');

// Prevent process.exit during tests
const originalExit = process.exit;
const originalSemanticRouting = process.env.SEMANTIC_ROUTING;
let lastExitCode = null; // eslint-disable-line no-unused-vars

beforeEach(() => {
  lastExitCode = null;
  process.exit = code => {
    lastExitCode = code;
  };
  process.env.SEMANTIC_ROUTING = 'off';
});

afterEach(() => {
  process.exit = originalExit;
  if (originalSemanticRouting === undefined) {
    delete process.env.SEMANTIC_ROUTING;
  } else {
    process.env.SEMANTIC_ROUTING = originalSemanticRouting;
  }
});

// =============================================================================
// Test: Module loads and exports functions
// =============================================================================

describe('user-prompt-unified module exports', () => {
  it('should export required functions', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // Core check functions
    assert.strictEqual(
      typeof unified.checkRouterModeReset,
      'function',
      'checkRouterModeReset should be exported'
    );
    assert.strictEqual(
      typeof unified.checkRouterEnforcement,
      'function',
      'checkRouterEnforcement should be exported'
    );
    assert.strictEqual(
      typeof unified.checkMemoryReminder,
      'function',
      'checkMemoryReminder should be exported'
    );
    assert.strictEqual(
      typeof unified.checkEvolutionTrigger,
      'function',
      'checkEvolutionTrigger should be exported'
    );
    assert.strictEqual(
      typeof unified.checkMemoryHealth,
      'function',
      'checkMemoryHealth should be exported'
    );

    // Main entry point
    assert.strictEqual(typeof unified.runAllChecks, 'function', 'runAllChecks should be exported');

    // Helper for testing
    assert.strictEqual(
      typeof unified.parseHookInput,
      'function',
      'parseHookInput should be exported'
    );
  });
});

// =============================================================================
// Test: Agent registry normalization
// =============================================================================

describe('agentsFromRegistry', () => {
  it('should map registry agents into scoring records', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const registry = {
      agents: {
        developer: {
          id: 'developer',
          displayName: 'developer',
          filePath: '.claude/agents/core/developer.md',
          capabilities: [
            {
              description: 'Implementation agent.',
              skills: ['tdd', 'debugging'],
              triggerPhrases: ['implement feature'],
              tags: ['implementation'],
              examples: ['Build a login API'],
            },
          ],
        },
        qa: {
          id: 'qa',
          capabilities: [
            {
              description: 'Testing agent.',
              skills: ['qa-workflow', 'tdd'],
            },
          ],
        },
      },
    };

    const agents = unified.agentsFromRegistry(registry);
    assert.strictEqual(agents.length, 2, 'Should return two agents');
    const developer = agents.find(a => a.name === 'developer');
    assert.ok(developer, 'Developer agent should exist');
    assert.strictEqual(developer.description, 'Implementation agent.');
    assert.deepStrictEqual(
      developer.skills.sort(),
      ['debugging', 'tdd'].sort(),
      'Should merge skills from capabilities'
    );
    assert.strictEqual(developer.path, '.claude/agents/core/developer.md');
    assert.ok(
      developer.capabilityPhrases.includes('implement feature'),
      'Should include trigger phrases'
    );
    assert.ok(developer.capabilityPhrases.includes('implementation'), 'Should include tags');
  });

  it('should return empty array for invalid registry', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    assert.deepStrictEqual(unified.agentsFromRegistry(null), []);
    assert.deepStrictEqual(unified.agentsFromRegistry({}), []);
  });
});

// =============================================================================
// Test: Router Mode Reset Logic (from router-mode-reset.cjs)
// =============================================================================

describe('checkRouterModeReset', () => {
  it('should skip reset for slash commands', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: '/help' };
    const result = unified.checkRouterModeReset(hookInput);

    assert.strictEqual(result.skipped, true, 'Should skip for slash commands');
    assert.strictEqual(result.reason, 'slash_command', 'Reason should be slash_command');
  });

  it('should reset state for normal prompts', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    // Clear any existing state
    routerState.resetToRouterMode();

    const hookInput = { prompt: 'Fix the login bug' };
    const result = unified.checkRouterModeReset(hookInput);

    assert.strictEqual(result.skipped, false, 'Should not skip for normal prompts');
    assert.strictEqual(result.stateReset, true, 'Should reset state');
  });

  // ===========================================================================
  // ROUTING-002 FIX: Always reset to router mode on new user prompt
  // ===========================================================================
  it('should ALWAYS reset to router mode on new user prompt, even after recent task (ROUTING-002 fix)', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    // Simulate: Task was spawned 5 minutes ago (within the old 30-minute window)
    routerState.enterAgentMode('Previous task from user');
    routerState.invalidateStateCache();

    // Verify we're in agent mode
    let state = routerState.getState();
    assert.strictEqual(state.mode, 'agent', 'Should be in agent mode after enterAgentMode');
    assert.strictEqual(state.taskSpawned, true, 'taskSpawned should be true');

    // Now a NEW user prompt comes in
    const hookInput = { prompt: 'List all TypeScript files in the project' };
    const result = unified.checkRouterModeReset(hookInput);

    // ROUTING-002 FIX: Should ALWAYS reset to router mode
    assert.strictEqual(
      result.stateReset,
      true,
      'ROUTING-002: New user prompt should ALWAYS reset to router mode'
    );
    assert.strictEqual(
      result.skipped,
      false,
      'ROUTING-002: Should NOT skip reset for new user prompts'
    );

    // Verify state is now in router mode
    state = routerState.getState();
    assert.strictEqual(
      state.mode,
      'router',
      'ROUTING-002: Mode should be router after new user prompt'
    );
    assert.strictEqual(
      state.taskSpawned,
      false,
      'ROUTING-002: taskSpawned should be false after new user prompt'
    );
  });

  it('should allow Glob to be blocked after state reset (end-to-end ROUTING-002)', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');
    const routingGuard = require('../../.claude/hooks/routing/routing-guard.cjs');

    // Step 1: Simulate previous session's agent mode
    routerState.enterAgentMode('Previous task');
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();

    // Step 2: New user prompt arrives - should reset state
    const hookInput = { prompt: 'List TypeScript files using Glob' };
    const resetResult = unified.checkRouterModeReset(hookInput);

    // Step 3: Verify state is reset
    assert.strictEqual(resetResult.stateReset, true, 'State should be reset');

    // Step 4: Now check if Glob would be blocked
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();
    process.env.ROUTER_SELF_CHECK = 'block';

    const globCheck = routingGuard.checkRouterSelfCheck('Glob', {});

    // ROUTING-002 FIX: Glob should be BLOCKED because we're in router mode
    assert.strictEqual(
      globCheck.pass,
      false,
      'ROUTING-002 End-to-End: Glob should be BLOCKED after state reset'
    );
  });
});

// =============================================================================
// Test: Router Enforcer Logic (from router-enforcer.cjs)
// =============================================================================

describe('checkRouterEnforcement', () => {
  it('should skip for very short prompts', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'hi' };
    const result = await unified.checkRouterEnforcement(hookInput);

    assert.strictEqual(result.skipped, true, 'Should skip for short prompts');
  });

  it('should skip for slash commands', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: '/commit -m "test"' };
    const result = await unified.checkRouterEnforcement(hookInput);

    assert.strictEqual(result.skipped, true, 'Should skip for slash commands');
  });

  it('should detect developer intent for bug fix prompts', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Fix the login bug in the authentication module' };
    const result = await unified.checkRouterEnforcement(hookInput);

    assert.ok(result.candidates && result.candidates.length > 0, 'Should have candidates');
    const hasReasonableAgent = result.candidates.some(c =>
      ['developer', 'qa', 'security-architect'].includes(c.agent?.name)
    );
    assert.ok(
      hasReasonableAgent || result.skipped === true,
      'Should include a reasonable agent or skip'
    );
  });

  it('should detect high complexity for security-related prompts', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Add OAuth2 authentication to the API' };
    const result = await unified.checkRouterEnforcement(hookInput);

    // Security-related prompts should trigger high complexity
    if (!result.skipped) {
      assert.ok(
        ['high', 'epic'].includes(result.planningReq?.complexity) ||
          result.planningReq?.requiresSecurityReview,
        'Should detect security-sensitive request'
      );
    }
  });

  it('should detect intent via INTENT_KEYWORDS for multi-word phrases', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Need guidance on system architecture for a new service' };
    const result = await unified.checkRouterEnforcement(hookInput);

    if (!result.skipped) {
      assert.strictEqual(result.intent, 'architect', 'Should detect architect intent');
    }
  });

  it('should pick capability based on priority when multiple match', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Review the security of the auth code' };
    const result = await unified.checkRouterEnforcement(hookInput);

    if (!result.skipped) {
      assert.strictEqual(
        result.capability,
        'security-review',
        'Security capability should take priority'
      );
    }
  });
});

// =============================================================================
// Test: Memory Reminder Logic (from memory-reminder.cjs)
// =============================================================================

describe('checkMemoryReminder', () => {
  it('should return empty if memory directory does not exist', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // Use a non-existent path
    const result = unified.checkMemoryReminder({}, '/nonexistent/path');

    assert.strictEqual(result.show, false, 'Should not show reminder if no memory dir');
  });

  it('should detect existing memory files with content', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // Use actual project root
    const result = unified.checkMemoryReminder({}, PROJECT_ROOT);

    // If memory files exist, should have file info
    assert.ok(result.files !== undefined, 'Should have files property');
    assert.ok(Array.isArray(result.files), 'files should be an array');
  });
});

// =============================================================================
// Test: Evolution Trigger Detection (from evolution-trigger-detector.cjs)
// =============================================================================

describe('checkEvolutionTrigger', () => {
  it('should detect explicit creation trigger', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Create a new agent for Kubernetes deployments' };
    const result = unified.checkEvolutionTrigger(hookInput);

    assert.ok(result.triggers && result.triggers.length > 0, 'Should detect creation trigger');
    assert.strictEqual(
      result.triggers[0].type,
      'explicit_creation',
      'Type should be explicit_creation'
    );
  });

  it('should detect capability need trigger', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'I need a Python agent to handle data processing' };
    const result = unified.checkEvolutionTrigger(hookInput);

    assert.ok(result.triggers && result.triggers.length > 0, 'Should detect capability need');
  });

  it('should detect gap detection trigger', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'There is no matching agent for this task' };
    const result = unified.checkEvolutionTrigger(hookInput);

    assert.ok(result.triggers && result.triggers.length > 0, 'Should detect gap');
  });

  it('should return empty triggers for normal prompts', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Fix the button color on the homepage' };
    const result = unified.checkEvolutionTrigger(hookInput);

    assert.ok(result.triggers.length === 0, 'Should have no triggers for normal prompt');
  });

  it('should respect EVOLUTION_TRIGGER_DETECTION=off', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const oldEnv = process.env.EVOLUTION_TRIGGER_DETECTION;
    process.env.EVOLUTION_TRIGGER_DETECTION = 'off';

    const hookInput = { prompt: 'Create a new agent for testing' };
    const result = unified.checkEvolutionTrigger(hookInput);

    assert.strictEqual(result.enabled, false, 'Should be disabled when env var is off');

    process.env.EVOLUTION_TRIGGER_DETECTION = oldEnv;
  });
});

// =============================================================================
// Test: Memory Health Check (from memory-health-check.cjs)
// =============================================================================

describe('checkMemoryHealth', () => {
  it('should return health status', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const result = unified.checkMemoryHealth({}, PROJECT_ROOT);

    // Should have status field
    assert.ok(result.status !== undefined, 'Should have status');
    assert.ok(
      ['healthy', 'warning', 'error', 'unavailable'].includes(result.status),
      'Status should be valid'
    );
  });

  it('should return unavailable if memory manager not present', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // Use a non-existent path
    const result = unified.checkMemoryHealth({}, '/nonexistent/path');

    assert.strictEqual(result.status, 'unavailable', 'Should be unavailable for invalid path');
  });

  it('should include metrics when available', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const result = unified.checkMemoryHealth({}, PROJECT_ROOT);

    // If not unavailable, should have metrics
    if (result.status !== 'unavailable') {
      assert.ok(result.metrics !== undefined, 'Should have metrics');
    }
  });
});

// =============================================================================
// Test: Combined runAllChecks
// =============================================================================

describe('runAllChecks', () => {
  it('should run all checks and return combined result', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Fix the login bug in the app' };
    const result = await unified.runAllChecks(hookInput, PROJECT_ROOT);

    // Should have all check results
    assert.ok(result.routerModeReset !== undefined, 'Should have routerModeReset result');
    assert.ok(result.routerEnforcement !== undefined, 'Should have routerEnforcement result');
    assert.ok(result.memoryReminder !== undefined, 'Should have memoryReminder result');
    assert.ok(result.evolutionTrigger !== undefined, 'Should have evolutionTrigger result');
    assert.ok(result.memoryHealth !== undefined, 'Should have memoryHealth result');
  });

  it('should handle null/empty input gracefully', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const result = await unified.runAllChecks(null, PROJECT_ROOT);

    // Should not throw, should return results
    assert.ok(result !== undefined, 'Should return result for null input');
  });

  it('should always allow (exit 0) as all checks are advisory', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Test prompt' };
    const result = await unified.runAllChecks(hookInput, PROJECT_ROOT);

    // The unified hook should never block (all original hooks exit 0)
    assert.strictEqual(result.exitCode, 0, 'Should always exit 0 (advisory mode)');
  });
});

// =============================================================================
// Test: Backward compatibility with original hook outputs
// =============================================================================

describe('backward compatibility', () => {
  it('should produce router analysis output for valid prompts', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    const hookInput = { prompt: 'Implement a new feature for user registration with OAuth' };
    const result = await unified.runAllChecks(hookInput, PROJECT_ROOT);

    // Router enforcement should produce analysis
    const enforcement = result.routerEnforcement;
    if (!enforcement.skipped) {
      assert.ok(
        enforcement.candidates !== undefined || enforcement.intent !== undefined,
        'Should have routing analysis'
      );
    }
  });

  it('should detect evolution triggers same as original hook', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // Test each trigger pattern from original hook
    const testCases = [
      { prompt: 'create a new agent for X', expectedType: 'explicit_creation' },
      { prompt: 'need a skill for handling Y', expectedType: 'capability_need' },
      { prompt: 'no matching agent for Z', expectedType: 'gap_detection' },
      { prompt: 'evolve the system to support W', expectedType: 'explicit_evolution' },
    ];

    for (const tc of testCases) {
      const result = unified.checkEvolutionTrigger({ prompt: tc.prompt });
      if (result.triggers.length > 0) {
        assert.strictEqual(
          result.triggers[0].type,
          tc.expectedType,
          `Should detect ${tc.expectedType} for: ${tc.prompt}`
        );
      }
    }
  });
});

// =============================================================================
// Test: ROUTING-003 FIX - Session Boundary Detection
// =============================================================================

describe('ROUTING-003: Session Boundary Detection', () => {
  it('should reset state when session ID changes (stale state from previous session)', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    // Step 1: Simulate state from PREVIOUS session
    // This mimics what happens when state file persists between sessions
    routerState.enterAgentMode('Task from previous session');
    routerState.invalidateStateCache();

    // Manually set a different session ID in the state file
    const stateFile = routerState.STATE_FILE;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    state.sessionId = 'old-session-12345';
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    routerState.invalidateStateCache();

    // Step 2: Simulate NEW session with different session ID
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'new-session-67890';

    try {
      // Step 3: New user prompt arrives
      const hookInput = { prompt: 'Use Glob to list all TypeScript files' };
      const result = unified.checkRouterModeReset(hookInput);

      // ROUTING-003 FIX: Should detect session boundary and reset
      assert.strictEqual(
        result.stateReset,
        true,
        'ROUTING-003: Should reset state when session ID changes'
      );
      assert.strictEqual(
        result.sessionBoundaryDetected,
        true,
        'ROUTING-003: Should detect session boundary'
      );

      // Verify state is reset to router mode
      routerState.invalidateStateCache();
      const newState = routerState.getState();
      assert.strictEqual(
        newState.mode,
        'router',
        'ROUTING-003: Mode should be router after session boundary reset'
      );
      assert.strictEqual(
        newState.taskSpawned,
        false,
        'ROUTING-003: taskSpawned should be false after session boundary reset'
      );
      assert.strictEqual(
        newState.sessionId,
        'new-session-67890',
        'ROUTING-003: sessionId should be updated to new session'
      );
    } finally {
      // Restore original session ID
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });

  it('should reset state when previous sessionId is null and current is set', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    // Step 1: Simulate state with null sessionId (common case)
    routerState.enterAgentMode('Task with null sessionId');
    routerState.invalidateStateCache();

    // Set sessionId to null explicitly
    const stateFile = routerState.STATE_FILE;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    state.sessionId = null;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    routerState.invalidateStateCache();

    // Step 2: New session with actual session ID
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'new-session-with-id';

    try {
      // Step 3: New user prompt arrives
      const hookInput = { prompt: 'Fix the login bug' };
      const result = unified.checkRouterModeReset(hookInput);

      // Should detect session boundary (null -> defined)
      assert.strictEqual(
        result.stateReset,
        true,
        'ROUTING-003: Should reset when sessionId changes from null to defined'
      );

      // Verify new sessionId is saved
      routerState.invalidateStateCache();
      const newState = routerState.getState();
      assert.strictEqual(
        newState.sessionId,
        'new-session-with-id',
        'ROUTING-003: sessionId should be updated'
      );
    } finally {
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });

  it('should NOT flag session boundary when sessionId matches', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    // Set up state with matching session ID
    const sessionId = 'same-session-12345';
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = sessionId;

    try {
      // Reset to router mode which sets the current session ID
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      // Enter agent mode (within same session)
      routerState.enterAgentMode('Active task in current session');
      routerState.invalidateStateCache();

      // New prompt in SAME session
      const hookInput = { prompt: 'Continue working on the task' };
      const result = unified.checkRouterModeReset(hookInput);

      // Should still reset to router mode (ROUTING-002 behavior)
      // but should NOT detect session boundary
      assert.strictEqual(
        result.stateReset,
        true,
        'Should still reset to router mode per ROUTING-002'
      );

      // Session boundary should NOT be detected when sessions match
      // (sessionBoundaryDetected might not exist or should be false)
      const sessionBoundaryDetected = result.sessionBoundaryDetected || false;
      assert.strictEqual(
        sessionBoundaryDetected,
        false,
        'Should NOT detect session boundary when session ID matches'
      );
    } finally {
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });
});

// =============================================================================
// Test: Performance - Shared state caching
// =============================================================================

describe('performance optimizations', () => {
  it('should use shared hook input parsing', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');

    // parseHookInput should be a single shared function
    assert.strictEqual(typeof unified.parseHookInput, 'function', 'Should export parseHookInput');
  });
});

// =============================================================================
// Core Fundamentals: STM writes on UserPromptSubmit
// =============================================================================

describe('STM writes (UserPromptSubmit)', () => {
  it('should write STM session_current.json (best-effort)', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-stm-'));

    try {
      const result = await unified.runAllChecks(
        { prompt: 'Hello STM', session_id: 'test-session-stm' },
        tmpRoot
      );

      // If memory tiers are available, verify the expected file exists.
      const stmPath = path.join(
        tmpRoot,
        '.claude',
        'context',
        'memory',
        'stm',
        'session_current.json'
      );
      if (result.stmWrite) {
        assert.strictEqual(fs.existsSync(stmPath), true, 'STM session_current.json should exist');
        const entry = JSON.parse(fs.readFileSync(stmPath, 'utf8'));
        assert.strictEqual(entry.session_id, 'test-session-stm');
        assert.strictEqual(entry.tier, 'STM');
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

console.log('All tests defined. Running...');
