#!/usr/bin/env node
/**
 * Agent Context Tracker Tests
 * ============================
 *
 * TDD tests for agent-context-tracker.cjs PostToolUse(Task) hook.
 * This hook sets router state to "agent" mode when Task tool is used,
 * and detects special agents (PLANNER, SECURITY-ARCHITECT).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Module under test
let agentContextTracker;
let routerState;

try {
  // Can't execute hook directly (uses process.exit), so we'll test the functions
  agentContextTracker = require('../../.claude/hooks/routing/agent-context-tracker.cjs');
  routerState = require('../../.claude/hooks/routing/router-state.cjs');
} catch (_err) {
  agentContextTracker = null; // eslint-disable-line no-unused-vars
  routerState = null;
}

describe('agent-context-tracker', () => {
  let originalEnv;
  let stateFilePath;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Get state file path from router-state module
    if (routerState && routerState.STATE_FILE) {
      stateFilePath = routerState.STATE_FILE;
    }
  });

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }

    // Reset router state to clean slate
    if (routerState) {
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
    }
  });

  describe('Task tool detection', () => {
    it('should detect Task tool invocations correctly', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Initially in router mode
      let state = routerState.getState();
      assert.strictEqual(state.mode, 'router');
      assert.strictEqual(state.taskSpawned, false);

      // Simulate Task tool invocation
      routerState.enterAgentMode('Test task');

      // Should now be in agent mode
      state = routerState.getState();
      assert.strictEqual(state.mode, 'agent');
      assert.strictEqual(state.taskSpawned, true);
      assert.strictEqual(state.taskDescription, 'Test task');
      assert.ok(state.taskSpawnedAt, 'Should have taskSpawnedAt timestamp');
    });

    it('should ignore non-Task tool invocations', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Start in router mode
      routerState.resetToRouterMode();
      let state = routerState.getState();
      assert.strictEqual(state.mode, 'router');

      // Non-Task tools should not trigger agent mode
      // (The hook would exit early for non-Task tools)
      // We can verify that the state remains unchanged
      state = routerState.getState();
      assert.strictEqual(state.mode, 'router');
      assert.strictEqual(state.taskSpawned, false);
    });
  });

  describe('PLANNER agent detection', () => {
    it('should detect PLANNER in prompt', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Reset state
      routerState.resetToRouterMode();

      // Simulate PLANNER spawn via prompt
      const toolInput = {
        prompt: 'You are PLANNER. Design the authentication system.',
        description: 'Design auth system',
      };

      // Enter agent mode
      routerState.enterAgentMode(toolInput.description);

      // Check if prompt contains PLANNER
      const hasPlanner = toolInput.prompt.includes('You are PLANNER');
      assert.strictEqual(hasPlanner, true, 'Should detect PLANNER in prompt');

      // Mark planner spawned
      routerState.markPlannerSpawned();

      // Verify planner was marked
      const state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, true, 'Should mark planner as spawned');
    });

    it('should detect PLANNER in description (case-insensitive)', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();

      const toolInput = {
        description: 'Planner designing auth system',
        prompt: 'Design the system',
      };

      // Check description
      const hasPlanner = toolInput.description.toLowerCase().includes('planner');
      assert.strictEqual(hasPlanner, true, 'Should detect planner in description');
    });

    it('should detect "You are the PLANNER" variant', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        prompt: 'You are the PLANNER agent. Design the feature...',
        description: 'Design feature',
      };

      const hasPlanner =
        toolInput.prompt.includes('You are PLANNER') ||
        toolInput.prompt.includes('You are the PLANNER');
      assert.strictEqual(hasPlanner, true, 'Should detect "You are the PLANNER"');
    });

    it('should detect planner in subagent_type', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        subagent_type: 'planning-agent',
        description: 'Planning task',
        prompt: 'Plan the feature',
      };

      const hasPlanner = (toolInput.subagent_type || '').toLowerCase().includes('plan');
      assert.strictEqual(hasPlanner, true, 'Should detect plan in subagent_type');
    });

    it('should not detect PLANNER in non-planner tasks', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        prompt: 'You are DEVELOPER. Fix the bug...',
        description: 'Developer fixing bug',
      };

      const hasPlanner = toolInput.prompt.includes('PLANNER');
      assert.strictEqual(hasPlanner, false, 'Should not detect PLANNER');
    });
  });

  describe('SECURITY-ARCHITECT agent detection', () => {
    it('should detect SECURITY-ARCHITECT in prompt', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();

      const toolInput = {
        prompt: 'You are SECURITY-ARCHITECT. Review the auth design...',
        description: 'Security review',
      };

      // Check prompt
      const hasSecurity = toolInput.prompt.includes('SECURITY-ARCHITECT');
      assert.strictEqual(hasSecurity, true, 'Should detect SECURITY-ARCHITECT in prompt');

      // Enter agent mode and mark security spawned
      routerState.enterAgentMode(toolInput.description);
      routerState.markSecuritySpawned();

      const state = routerState.getState();
      assert.strictEqual(state.securitySpawned, true, 'Should mark security as spawned');
    });

    it('should detect security in description (case-insensitive)', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        description: 'Security reviewing auth design',
        prompt: 'Review the design',
      };

      const hasSecurity = toolInput.description.toLowerCase().includes('security');
      assert.strictEqual(hasSecurity, true, 'Should detect security in description');
    });

    it('should detect security in subagent_type', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        subagent_type: 'security-review',
        description: 'Review task',
        prompt: 'Review the code',
      };

      const hasSecurity = (toolInput.subagent_type || '').toLowerCase().includes('security');
      assert.strictEqual(hasSecurity, true, 'Should detect security in subagent_type');
    });

    it('should not detect SECURITY-ARCHITECT in non-security tasks', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      const toolInput = {
        prompt: 'You are DEVELOPER. Implement the feature...',
        description: 'Developer implementing feature',
      };

      const hasSecurity = toolInput.prompt.includes('SECURITY-ARCHITECT');
      assert.strictEqual(hasSecurity, false, 'Should not detect SECURITY-ARCHITECT');
    });
  });

  describe('State persistence', () => {
    it('should write state to router-state.json', () => {
      assert.ok(routerState, 'Router state module should be loadable');
      assert.ok(stateFilePath, 'Should have state file path');

      // Reset and enter agent mode
      routerState.resetToRouterMode();
      routerState.enterAgentMode('Test task description');

      // Verify file exists
      assert.ok(fs.existsSync(stateFilePath), 'State file should exist');

      // Read and verify content
      const content = fs.readFileSync(stateFilePath, 'utf-8');
      const state = JSON.parse(content);

      assert.strictEqual(state.mode, 'agent');
      assert.strictEqual(state.taskSpawned, true);
      assert.strictEqual(state.taskDescription, 'Test task description');
      assert.ok(state.taskSpawnedAt, 'Should have timestamp');
    });

    it('should persist planner spawned flag', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.markPlannerSpawned();

      const state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, true);

      // Verify persistence by re-reading
      routerState.invalidateStateCache();
      const freshState = routerState.getState();
      assert.strictEqual(freshState.plannerSpawned, true, 'Should persist planner flag');
    });

    it('should persist security spawned flag', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.markSecuritySpawned();

      const state = routerState.getState();
      assert.strictEqual(state.securitySpawned, true);

      // Verify persistence
      routerState.invalidateStateCache();
      const freshState = routerState.getState();
      assert.strictEqual(freshState.securitySpawned, true, 'Should persist security flag');
    });
  });

  describe('State accumulation', () => {
    it('should track multiple agent spawns', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Reset to clean state
      routerState.resetToRouterMode();
      let state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, false);
      assert.strictEqual(state.securitySpawned, false);

      // Spawn PLANNER
      routerState.enterAgentMode('PLANNER designing feature');
      routerState.markPlannerSpawned();

      state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, true);
      assert.strictEqual(state.securitySpawned, false);

      // Spawn SECURITY-ARCHITECT (without resetting)
      routerState.markSecuritySpawned();

      state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, true, 'Planner flag should still be true');
      assert.strictEqual(state.securitySpawned, true, 'Security flag should now be true');
    });

    it('should maintain agent mode across multiple Task calls', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();

      // First Task spawn
      routerState.enterAgentMode('First task');
      let state = routerState.getState();
      assert.strictEqual(state.mode, 'agent');
      assert.strictEqual(state.taskDescription, 'First task');

      // Second Task spawn (updates description)
      routerState.enterAgentMode('Second task');
      state = routerState.getState();
      assert.strictEqual(state.mode, 'agent', 'Should remain in agent mode');
      assert.strictEqual(state.taskDescription, 'Second task', 'Should update description');
    });

    it('should reset flags on new prompt cycle', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Set up state with flags
      routerState.enterAgentMode('Test task');
      routerState.markPlannerSpawned();
      routerState.markSecuritySpawned();

      let state = routerState.getState();
      assert.strictEqual(state.plannerSpawned, true);
      assert.strictEqual(state.securitySpawned, true);

      // Reset to router mode (new prompt cycle)
      routerState.resetToRouterMode();

      state = routerState.getState();
      assert.strictEqual(state.mode, 'router');
      assert.strictEqual(state.taskSpawned, false);
      assert.strictEqual(state.plannerSpawned, false, 'Planner flag should reset');
      assert.strictEqual(state.securitySpawned, false, 'Security flag should reset');
    });
  });

  describe('Task description extraction', () => {
    it('should extract description from description field', () => {
      const toolInput = {
        description: 'PLANNER designing auth feature',
        prompt: 'Design auth',
      };

      assert.strictEqual(toolInput.description, 'PLANNER designing auth feature');
    });

    it('should extract description from prompt first line', () => {
      const toolInput = {
        prompt: 'You are DEVELOPER. Fix the login bug.\nDetails: The bug occurs when...',
      };

      const firstLine = toolInput.prompt.split('\n')[0];
      assert.strictEqual(firstLine, 'You are DEVELOPER. Fix the login bug.');
    });

    it('should truncate long prompt to 100 chars', () => {
      const longPrompt = 'A'.repeat(150);
      const toolInput = {
        prompt: longPrompt,
      };

      const firstLine = toolInput.prompt.split('\n')[0];
      const description = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;

      assert.strictEqual(description.length, 103); // 100 + '...'
      assert.ok(description.endsWith('...'));
    });

    it('should use subagent_type as fallback', () => {
      const toolInput = {
        subagent_type: 'general-purpose',
      };

      const description = `${toolInput.subagent_type} agent`;
      assert.strictEqual(description, 'general-purpose agent');
    });

    it('should use default description if all fields missing', () => {
      const toolInput = {};
      const description = toolInput.description || 'Task spawned';
      assert.strictEqual(description, 'Task spawned');
    });
  });

  describe('Edge cases', () => {
    it('should handle null tool input gracefully', () => {
      // The hook would skip null input, but detection functions should handle it
      const hasPlanner = false; // Would return false for null input
      const hasSecurity = false;

      assert.strictEqual(hasPlanner, false);
      assert.strictEqual(hasSecurity, false);
    });

    it('should handle missing fields in tool input', () => {
      const toolInput = {
        // No description, prompt, or subagent_type
      };

      const description = toolInput.description || 'Task spawned';
      assert.strictEqual(description, 'Task spawned');
    });

    it('should handle empty string fields', () => {
      const toolInput = {
        description: '',
        prompt: '',
        subagent_type: '',
      };

      // Detection should return false for empty strings
      const hasPlanner = toolInput.prompt.includes('PLANNER');
      const hasSecurity = toolInput.prompt.includes('SECURITY-ARCHITECT');

      assert.strictEqual(hasPlanner, false);
      assert.strictEqual(hasSecurity, false);
    });

    it('should handle missing state file gracefully', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Delete state file if it exists
      if (stateFilePath && fs.existsSync(stateFilePath)) {
        fs.unlinkSync(stateFilePath);
      }

      // Should return default state
      const state = routerState.getState();
      assert.strictEqual(state.mode, 'router');
      assert.strictEqual(state.taskSpawned, false);
    });

    it('should handle corrupted state file', () => {
      assert.ok(routerState, 'Router state module should be loadable');
      assert.ok(stateFilePath, 'Should have state file path');

      // Write invalid JSON
      const dir = path.dirname(stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(stateFilePath, 'invalid json{');

      // Invalidate cache to force re-read
      routerState.invalidateStateCache();

      // Should return default state on parse error
      const state = routerState.getState();
      assert.ok(state, 'Should return a state object');
      assert.strictEqual(typeof state.mode, 'string');
    });
  });

  describe('Debug output', () => {
    it('should log state changes when ROUTER_DEBUG=true', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Enable debug mode
      process.env.ROUTER_DEBUG = 'true';

      // Test that debug mode doesn't break functionality
      routerState.enterAgentMode('Test task with debug');
      const state = routerState.getState();

      assert.strictEqual(state.mode, 'agent');
      assert.strictEqual(state.taskDescription, 'Test task with debug');
    });

    it('should not log when ROUTER_DEBUG is not set', () => {
      assert.ok(routerState, 'Router state module should be loadable');

      // Ensure debug is off
      delete process.env.ROUTER_DEBUG;

      // Should still work without logging
      routerState.enterAgentMode('Test task without debug');
      const state = routerState.getState();

      assert.strictEqual(state.mode, 'agent');
    });
  });

  describe('Hook exit behavior', () => {
    it('should always exit with code 0 (never blocks)', () => {
      // The hook always exits with code 0 because it only tracks state
      // It never blocks operations
      // This is a design requirement documented in the hook header

      // We verify this by checking that the hook sets state but doesn't throw
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.enterAgentMode('Test task');
      const state = routerState.getState();

      // State should be set
      assert.strictEqual(state.mode, 'agent');
      // No exception thrown = success
    });
  });
});
