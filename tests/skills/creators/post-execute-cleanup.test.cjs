#!/usr/bin/env node
/**
 * Tests for creator post-execute hooks cleanup functionality
 *
 * CRIT-002: Post-execute hooks must clean up active-creators.json state
 *
 * Issue: Post-execute hooks were stubs (no cleanup implemented).
 * Active creator state was never cleared, leaving artifacts in
 * "being-created" state indefinitely.
 *
 * Fix: Implement cleanup logic in post-execute hooks to:
 * - Delete active-creators.json entry
 * - Log completion to memory
 * - Validate created artifact was registered
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Cross-platform helper to run a hook with JSON input.
 * Uses environment variable to pass JSON since Windows cmd.exe
 * doesn't handle single quotes in the same way as Unix shells.
 *
 * @param {string} hookPath - Absolute path to the hook script
 * @param {Object} input - Input object to pass as JSON
 * @param {string} cwd - Working directory
 * @returns {{ stdout: string, stderr: string }}
 */
function runHookWithInput(hookPath, input, cwd) {
  const jsonInput = JSON.stringify(input);
  const result = spawnSync(process.execPath, [hookPath, jsonInput], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, HOOK_INPUT_JSON: jsonInput },
    shell: false,
    windowsHide: true,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Import the guard's state management functions for comparison
const {
  markCreatorActive,
  isCreatorActive,
} = require('../../../.claude/hooks/routing/unified-creator-guard.cjs');

// State file path
const STATE_FILE = '.claude/context/runtime/active-creators.json';
const STATE_PATH = path.join(PROJECT_ROOT, STATE_FILE);

// List of all creator post-execute hooks
const CREATOR_POST_HOOKS = [
  { path: '.claude/skills/skill-creator/hooks/post-execute.cjs', creator: 'skill-creator' },
  { path: '.claude/skills/agent-creator/hooks/post-execute.cjs', creator: 'agent-creator' },
  { path: '.claude/skills/hook-creator/hooks/post-execute.cjs', creator: 'hook-creator' },
  { path: '.claude/skills/workflow-creator/hooks/post-execute.cjs', creator: 'workflow-creator' },
  { path: '.claude/skills/template-creator/hooks/post-execute.cjs', creator: 'template-creator' },
  { path: '.claude/skills/schema-creator/hooks/post-execute.cjs', creator: 'schema-creator' },
];

// Save and restore state file
let originalState = null;

beforeEach(() => {
  // Save original state if it exists
  if (fs.existsSync(STATE_PATH)) {
    originalState = fs.readFileSync(STATE_PATH, 'utf8');
  }
  // Clear state for clean test
  try {
    if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch (_e) {
    // Ignore
  }
});

afterEach(() => {
  // Restore original state
  try {
    if (originalState) {
      const stateDir = path.dirname(STATE_PATH);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
      fs.writeFileSync(STATE_PATH, originalState);
    } else if (fs.existsSync(STATE_PATH)) {
      fs.unlinkSync(STATE_PATH);
    }
  } catch (_e) {
    // Ignore
  }
});

// =============================================================================
// TEST: CRIT-002 - POST-EXECUTE CLEANUP
// =============================================================================

describe('CRIT-002: Post-execute hooks clear creator state', () => {
  // Test each existing post-execute hook
  for (const { path: hookPath, creator } of CREATOR_POST_HOOKS) {
    it(`${creator} post-execute hook clears active state`, () => {
      const fullPath = path.join(PROJECT_ROOT, hookPath);

      // Skip if hook doesn't exist
      if (!fs.existsSync(fullPath)) {
        // Mark as todo - hook needs to be created
        assert.fail(`Post-execute hook does not exist: ${hookPath}`);
      }

      // First, mark the creator as active (simulating pre-execute)
      markCreatorActive(creator, 'test-artifact');

      // Verify creator is active
      let state = isCreatorActive(creator);
      assert.strictEqual(state.active, true, `${creator} should be active after marking`);

      // Run the post-execute hook with success result
      runHookWithInput(fullPath, { success: true, artifactName: 'test-artifact' }, PROJECT_ROOT);

      // Verify creator state is cleared
      state = isCreatorActive(creator);
      assert.strictEqual(
        state.active,
        false,
        `${creator} should be inactive after post-execute hook runs`
      );
    });
  }
});

describe('CRIT-002: Post-execute hooks handle failure gracefully', () => {
  for (const { path: hookPath, creator } of CREATOR_POST_HOOKS) {
    it(`${creator} post-execute hook clears state even on failure`, () => {
      const fullPath = path.join(PROJECT_ROOT, hookPath);

      // Skip if hook doesn't exist
      if (!fs.existsSync(fullPath)) {
        assert.fail(`Post-execute hook does not exist: ${hookPath}`);
      }

      // First, mark the creator as active
      markCreatorActive(creator, 'test-artifact');

      // Verify creator is active
      let state = isCreatorActive(creator);
      assert.strictEqual(state.active, true, `${creator} should be active`);

      // Run the post-execute hook with failure result
      runHookWithInput(fullPath, { success: false, error: 'Test failure' }, PROJECT_ROOT);

      // Verify creator state is still cleared (cleanup happens regardless of success/failure)
      state = isCreatorActive(creator);
      assert.strictEqual(
        state.active,
        false,
        `${creator} should be inactive even after failed execution`
      );
    });
  }
});

describe('CRIT-002: Post-execute hooks preserve other creators state', () => {
  it('clearing one creator does not affect others', () => {
    // Mark multiple creators as active
    markCreatorActive('skill-creator', 'test-skill');
    markCreatorActive('agent-creator', 'test-agent');

    // Verify both are active
    assert.strictEqual(isCreatorActive('skill-creator').active, true);
    assert.strictEqual(isCreatorActive('agent-creator').active, true);

    // Run skill-creator post-execute hook
    const skillPostHook = path.join(
      PROJECT_ROOT,
      '.claude/skills/skill-creator/hooks/post-execute.cjs'
    );

    if (!fs.existsSync(skillPostHook)) {
      assert.fail('skill-creator post-execute hook does not exist');
    }

    runHookWithInput(skillPostHook, { success: true }, PROJECT_ROOT);

    // Verify skill-creator is cleared but agent-creator is still active
    assert.strictEqual(
      isCreatorActive('skill-creator').active,
      false,
      'skill-creator should be cleared'
    );
    assert.strictEqual(
      isCreatorActive('agent-creator').active,
      true,
      'agent-creator should still be active'
    );
  });
});

// =============================================================================
// TEST: POST-EXECUTE HOOK SOURCE CODE VALIDATION
// =============================================================================

describe('CRIT-002: Post-execute hooks have clearCreatorActive logic', () => {
  it('all existing post-execute hooks contain cleanup logic', () => {
    for (const { path: hookPath, creator } of CREATOR_POST_HOOKS) {
      const fullPath = path.join(PROJECT_ROOT, hookPath);

      if (!fs.existsSync(fullPath)) {
        assert.fail(`Post-execute hook does not exist: ${hookPath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');

      // Should contain state file path
      const hasStateFile =
        content.includes('active-creators.json') || content.includes('STATE_FILE');
      assert.ok(hasStateFile, `${hookPath} should reference state file`);

      // Should contain creator name
      const hasCreatorName = content.includes(creator) || content.includes('CREATOR_NAME');
      assert.ok(hasCreatorName, `${hookPath} should reference creator name`);

      // Should NOT be a stub (should have actual cleanup logic)
      const hasGeneratedNoOp = content.includes(
        'No skill-specific post-processing is configured for this generated hook.'
      );
      const isStub =
        hasGeneratedNoOp &&
        !content.includes('clearCreatorActive') &&
        !content.includes('active = false');
      assert.strictEqual(
        isStub,
        false,
        `${hookPath} should not be a stub - should have cleanup logic`
      );
    }
  });
});
