#!/usr/bin/env node
/**
 * Tests for creator pre-execute hooks TTL consistency
 *
 * CRIT-001: Pre-execute hooks must use the same TTL as unified-creator-guard.cjs
 *
 * Issue: Pre-execute hooks were using 10 minute TTL (600000ms) while
 * unified-creator-guard.cjs uses 3 minute TTL (180000ms). This creates
 * a 7 minute gap where creator state could be inconsistent.
 *
 * Fix: Align all pre-execute hooks to use the same TTL constant.
 * The TTL should also be configurable via CREATOR_STATE_TTL_MS env var.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Import the unified guard's TTL constant for comparison
const {
  DEFAULT_TTL_MS: GUARD_TTL_MS,
} = require('../../../.claude/hooks/routing/unified-creator-guard.cjs');

// Import the tracker's TTL constant for comparison
const {
  DEFAULT_TTL_MS: TRACKER_TTL_MS,
} = require('../../../.claude/hooks/routing/skill-invocation-tracker.cjs');

// Expected TTL value (3 minutes = 180000ms)
const EXPECTED_TTL_MS = 3 * 60 * 1000;

// State file path
const STATE_FILE = '.claude/context/runtime/active-creators.json';
const STATE_PATH = path.join(PROJECT_ROOT, STATE_FILE);

// List of all creator pre-execute hooks
const CREATOR_HOOKS = [
  '.claude/skills/skill-creator/hooks/pre-execute.cjs',
  '.claude/skills/agent-creator/hooks/pre-execute.cjs',
  '.claude/skills/hook-creator/hooks/pre-execute.cjs',
  '.claude/skills/workflow-creator/hooks/pre-execute.cjs',
  '.claude/skills/template-creator/hooks/pre-execute.cjs',
  '.claude/skills/schema-creator/hooks/pre-execute.cjs',
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
  // Clean up env vars
  delete process.env.CREATOR_STATE_TTL_MS;
});

// =============================================================================
// TEST: CRIT-001 - TTL CONSISTENCY
// =============================================================================

describe('CRIT-001: Pre-execute hooks TTL consistency', () => {
  it('guard and tracker have the same TTL (3 minutes)', () => {
    assert.strictEqual(
      GUARD_TTL_MS,
      EXPECTED_TTL_MS,
      `Guard TTL should be ${EXPECTED_TTL_MS}ms (3 minutes)`
    );
    assert.strictEqual(
      TRACKER_TTL_MS,
      EXPECTED_TTL_MS,
      `Tracker TTL should be ${EXPECTED_TTL_MS}ms (3 minutes)`
    );
    assert.strictEqual(GUARD_TTL_MS, TRACKER_TTL_MS, 'Guard and tracker should have the same TTL');
  });

  // Test each creator hook produces state with correct TTL
  for (const hookPath of CREATOR_HOOKS) {
    const creatorName = hookPath.split('/')[2]; // e.g., 'skill-creator'

    it(`${creatorName} pre-execute hook writes state with 3-minute TTL`, () => {
      const fullPath = path.join(PROJECT_ROOT, hookPath);

      // Skip if hook doesn't exist (some might be missing post-execute)
      if (!fs.existsSync(fullPath)) {
        assert.fail(`Hook file does not exist: ${hookPath}`);
      }

      // Run the pre-execute hook
      try {
        execSync(`node "${fullPath}" "{}"`, {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch {
        // Hook might exit with error if validation fails, but should still write state
        // Continue checking state file
      }

      // Verify state file was created
      assert.ok(
        fs.existsSync(STATE_PATH),
        `State file should exist after running ${creatorName} pre-execute hook`
      );

      // Read state and verify TTL
      const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      assert.ok(state[creatorName], `State should contain ${creatorName} entry`);
      assert.strictEqual(
        state[creatorName].ttl,
        EXPECTED_TTL_MS,
        `${creatorName} TTL should be ${EXPECTED_TTL_MS}ms (3 minutes), got ${state[creatorName].ttl}ms`
      );
    });
  }
});

// =============================================================================
// TEST: TTL ENV VAR CONFIGURABILITY
// =============================================================================

describe('CRIT-001: TTL configurability via environment variable', () => {
  it('pre-execute hooks respect CREATOR_STATE_TTL_MS env var', () => {
    const customTTL = 5 * 60 * 1000; // 5 minutes
    process.env.CREATOR_STATE_TTL_MS = String(customTTL);

    const hookPath = path.join(PROJECT_ROOT, '.claude/skills/skill-creator/hooks/pre-execute.cjs');

    // Run the pre-execute hook with custom TTL
    try {
      execSync(`node "${hookPath}" "{}"`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
        env: { ...process.env, CREATOR_STATE_TTL_MS: String(customTTL) },
      });
    } catch {
      // Continue checking state file
    }

    // Verify TTL in state matches env var
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    assert.strictEqual(
      state['skill-creator'].ttl,
      customTTL,
      `TTL should respect CREATOR_STATE_TTL_MS env var (${customTTL}ms)`
    );
  });
});

// =============================================================================
// TEST: SOURCE CODE TTL VALUES
// =============================================================================

describe('CRIT-001: Source code TTL values match', () => {
  it('all pre-execute hooks have TTL constant matching guard', () => {
    for (const hookPath of CREATOR_HOOKS) {
      const fullPath = path.join(PROJECT_ROOT, hookPath);

      if (!fs.existsSync(fullPath)) {
        assert.fail(`Hook file does not exist: ${hookPath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');

      // Check that the hook uses the correct TTL value
      // It should either:
      // 1. Reference DEFAULT_TTL_MS from unified-creator-guard.cjs
      // 2. Use 180000 (3 * 60 * 1000) directly
      // 3. Use a configurable env var with 180000 default

      // Should NOT contain 600000 (10 minutes - old value)
      const has600000 = /ttl:\s*600000/.test(content);
      assert.strictEqual(
        has600000,
        false,
        `${hookPath} should NOT contain old 10-minute TTL (600000ms)`
      );

      // Should contain either 180000 or reference to DEFAULT_TTL_MS or CREATOR_STATE_TTL_MS
      const hasCorrectTTL =
        /ttl:\s*180000/.test(content) ||
        /DEFAULT_TTL_MS/.test(content) ||
        /CREATOR_STATE_TTL_MS/.test(content) ||
        /3\s*\*\s*60\s*\*\s*1000/.test(content);

      assert.ok(hasCorrectTTL, `${hookPath} should use correct 3-minute TTL (180000ms) or env var`);
    }
  });
});
