#!/usr/bin/env node

/**
 * hook-creator - Pre-Execute Hook
 * Runs before the skill executes to validate input and mark hook-creator as active.
 *
 * CRITICAL: This hook creates the state file that unified-creator-guard.cjs checks.
 * Without this, the guard has no way to know hook-creator was invoked.
 *
 * State file: .claude/context/runtime/active-creators.json
 * Format: { "hook-creator": { "active": true, "invokedAt": "ISO string", "ttl": 600000 } }
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const CREATOR_NAME = 'hook-creator';

/**
 * Default TTL for creator active state (3 minutes)
 * CRIT-001 FIX: Aligned with unified-creator-guard.cjs DEFAULT_TTL_MS
 * SEC-REMEDIATION-001: Reduced from 10 to 3 minutes to minimize state tampering window
 * Configurable via CREATOR_STATE_TTL_MS env var
 */
const DEFAULT_TTL_MS = Number(process.env.CREATOR_STATE_TTL_MS) || 3 * 60 * 1000;

// Parse hook input
const input = safeParseJSON(process.argv[2] || '{}');

console.log(`[${CREATOR_NAME.toUpperCase()}] Pre-execute: Marking ${CREATOR_NAME} as active...`);

/**
 * Find project root by looking for .claude/CLAUDE.md
 * This is more reliable than just looking for .claude directory
 * because there may be nested .claude directories created by tests.
 * @returns {string} Project root path
 */
function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    // Check for CLAUDE.md which is unique to project root
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const STATE_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/active-creators.json');

/**
 * Mark hook-creator as active by updating unified state file.
 * This allows unified-creator-guard.cjs to know that hook writes are legitimate.
 */
function markCreatorActive() {
  try {
    const stateDir = path.dirname(STATE_FILE);

    // Ensure runtime directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // Read existing state or create new
    let state = {};
    if (fs.existsSync(STATE_FILE)) {
      try {
        state = safeParseJSON(fs.readFileSync(STATE_FILE, 'utf8'));
      } catch (_e) {
        // If file is corrupted, start fresh
        state = {};
      }
    }

    // Update this creator's state
    // CRIT-001 FIX: Use DEFAULT_TTL_MS (3 minutes) aligned with unified-creator-guard.cjs
    state[CREATOR_NAME] = {
      active: true,
      invokedAt: new Date().toISOString(),
      artifactName: null, // Will be set during workflow
      ttl: DEFAULT_TTL_MS,
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`[${CREATOR_NAME.toUpperCase()}] State file updated at:`, STATE_FILE);
    return true;
  } catch (err) {
    console.error(`[${CREATOR_NAME.toUpperCase()}] Failed to update state file:`, err.message);
    return false;
  }
}

/**
 * Validate input before execution
 */
function validateInput(_input) {
  const errors = [];

  // Basic validation - hook-creator can work with minimal input
  // The actual hook name is typically determined during the workflow

  return errors;
}

// Mark hook-creator as active FIRST (critical for unified-creator-guard)
const stateCreated = markCreatorActive();

if (!stateCreated) {
  console.warn(
    `[${CREATOR_NAME.toUpperCase()}] Warning: Could not create state file. unified-creator-guard may block hook writes.`
  );
}

// Run validation
const errors = validateInput(input);

if (errors.length > 0) {
  console.error(`[${CREATOR_NAME.toUpperCase()}] Validation failed:`);
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

console.log(
  `[${CREATOR_NAME.toUpperCase()}] Pre-execute complete. Hook-creator workflow is now active.`
);
process.exit(0);
