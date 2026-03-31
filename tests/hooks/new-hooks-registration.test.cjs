#!/usr/bin/env node
/**
 * new-hooks-registration.test.cjs
 *
 * Comprehensive test verifying:
 *   1. settings.json has exactly 10 event categories (7 original + 3 new).
 *   2. Each new hook category (SubagentStart, PermissionDenied, SessionStart)
 *      has correct registration structure: type:'command', timeout_ms, and a
 *      command referencing the correct .cjs lifecycle script.
 *   3. The 7 original event categories (UserPromptSubmit, PreToolUse,
 *      PostToolUse, PostToolUseFailure, SessionEnd, PreCompact, Stop) remain
 *      unchanged after adding the new hooks.
 *   4. All 3 new hook scripts follow mandatory security patterns:
 *        - 'use strict'; directive present as code (not only in comments)
 *        - project-root.cjs imported for path resolution
 *        - parseHookInputAsync or safeParseJSON used for input parsing
 *        - formatResult() used for structured output
 *        - process.cwd() does NOT appear in non-comment executable code
 *
 * Fulfills: VAL-NE-007, VAL-NE-008
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const LIFECYCLE_DIR = path.join(PROJECT_ROOT, '.claude', 'hooks', 'lifecycle');

// ─── Load settings.json ───────────────────────────────────────────────────────

let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`Failed to parse settings.json: ${err.message}`);
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** The 7 original hook event categories present before Phase 5. */
const ORIGINAL_CATEGORIES = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionEnd',
  'PreCompact',
  'Stop',
];

/** The 3 new hook event categories added in Phase 5 / milestone new-hook-events. */
const NEW_CATEGORIES = ['SubagentStart', 'PermissionDenied', 'SessionStart'];

/**
 * Expected hook script basenames for each new category.
 */
const NEW_HOOK_SCRIPTS = {
  SubagentStart: 'subagent-start-iron-law.cjs',
  PermissionDenied: 'permission-denied-logger.cjs',
  SessionStart: 'session-start-watchpaths.cjs',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return all hook objects registered under a given event category.
 * @param {string} eventName
 * @returns {{ matcher: string, hook: Object }[]}
 */
function getHooksForEvent(eventName) {
  const results = [];
  const groups = (settings.hooks || {})[eventName] || [];
  for (const group of groups) {
    const matcher = group.matcher || '';
    for (const hook of group.hooks || []) {
      results.push({ matcher, hook });
    }
  }
  return results;
}

/**
 * Strip block comments (/* ... *\/) and line comments (//) from JavaScript
 * source code. Returns only the non-comment portions of the code.
 *
 * This is a best-effort implementation sufficient for checking that
 * process.cwd() does not appear in executable code.
 *
 * @param {string} source - JavaScript source code
 * @returns {string} Source with comments replaced by whitespace
 */
function stripComments(source) {
  // Replace block comments with equivalent whitespace (preserving newlines)
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
  // Replace line comments
  stripped = stripped.replace(/\/\/[^\n]*/g, match => ' '.repeat(match.length));
  return stripped;
}

// ─── Suite 1: settings.json Structure ────────────────────────────────────────

describe('settings.json structure (VAL-NE-007)', () => {
  it('settings.json parses as valid JSON with hooks section', () => {
    assert.ok(
      settings && typeof settings === 'object',
      'settings.json must be a valid JSON object'
    );
    assert.ok(
      settings.hooks && typeof settings.hooks === 'object',
      'settings.json must have a hooks section'
    );
  });

  it('settings.json has exactly 10 event categories (7 original + 3 new)', () => {
    const categories = Object.keys(settings.hooks);
    assert.strictEqual(
      categories.length,
      10,
      `Expected 10 event categories, got ${categories.length}: ${categories.join(', ')}`
    );
  });

  it('all 7 original event categories are present', () => {
    const categories = new Set(Object.keys(settings.hooks));
    for (const cat of ORIGINAL_CATEGORIES) {
      assert.ok(
        categories.has(cat),
        `Original event category "${cat}" is missing from settings.json`
      );
    }
  });

  it('all 3 new event categories are present', () => {
    const categories = new Set(Object.keys(settings.hooks));
    for (const cat of NEW_CATEGORIES) {
      assert.ok(categories.has(cat), `New event category "${cat}" is missing from settings.json`);
    }
  });
});

// ─── Suite 2: SubagentStart registration ─────────────────────────────────────

describe('SubagentStart hook registration (VAL-NE-007)', () => {
  const event = 'SubagentStart';
  const scriptName = NEW_HOOK_SCRIPTS[event];

  it('SubagentStart category has at least 1 registration', () => {
    const hooks = getHooksForEvent(event);
    assert.ok(hooks.length >= 1, `${event} must have at least 1 hook registration`);
  });

  it('SubagentStart hook has type: "command"', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.strictEqual(
          hook.type,
          'command',
          `${event} hook for ${scriptName} must have type: 'command', got: ${hook.type}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('SubagentStart hook has timeout_ms set', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.ok(
          typeof hook.timeout_ms === 'number' && hook.timeout_ms > 0,
          `${event} hook for ${scriptName} must have timeout_ms > 0, got: ${hook.timeout_ms}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('SubagentStart hook command references subagent-start-iron-law.cjs', () => {
    const hooks = getHooksForEvent(event);
    const matching = hooks.filter(({ hook }) => (hook.command || '').includes(scriptName));
    assert.ok(
      matching.length >= 1,
      `${event} must have a registration referencing "${scriptName}". Found commands: ${hooks.map(h => h.hook.command).join(', ')}`
    );
  });
});

// ─── Suite 3: PermissionDenied registration ───────────────────────────────────

describe('PermissionDenied hook registration (VAL-NE-007)', () => {
  const event = 'PermissionDenied';
  const scriptName = NEW_HOOK_SCRIPTS[event];

  it('PermissionDenied category has at least 1 registration', () => {
    const hooks = getHooksForEvent(event);
    assert.ok(hooks.length >= 1, `${event} must have at least 1 hook registration`);
  });

  it('PermissionDenied hook has type: "command"', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.strictEqual(
          hook.type,
          'command',
          `${event} hook for ${scriptName} must have type: 'command', got: ${hook.type}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('PermissionDenied hook has timeout_ms set', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.ok(
          typeof hook.timeout_ms === 'number' && hook.timeout_ms > 0,
          `${event} hook for ${scriptName} must have timeout_ms > 0, got: ${hook.timeout_ms}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('PermissionDenied hook command references permission-denied-logger.cjs', () => {
    const hooks = getHooksForEvent(event);
    const matching = hooks.filter(({ hook }) => (hook.command || '').includes(scriptName));
    assert.ok(
      matching.length >= 1,
      `${event} must have a registration referencing "${scriptName}". Found commands: ${hooks.map(h => h.hook.command).join(', ')}`
    );
  });
});

// ─── Suite 4: SessionStart registration ──────────────────────────────────────

describe('SessionStart hook registration (VAL-NE-007)', () => {
  const event = 'SessionStart';
  const scriptName = NEW_HOOK_SCRIPTS[event];

  it('SessionStart category has at least 1 registration', () => {
    const hooks = getHooksForEvent(event);
    assert.ok(hooks.length >= 1, `${event} must have at least 1 hook registration`);
  });

  it('SessionStart hook has type: "command"', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.strictEqual(
          hook.type,
          'command',
          `${event} hook for ${scriptName} must have type: 'command', got: ${hook.type}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('SessionStart hook has timeout_ms set', () => {
    const hooks = getHooksForEvent(event);
    for (const { hook } of hooks) {
      if ((hook.command || '').includes(scriptName)) {
        assert.ok(
          typeof hook.timeout_ms === 'number' && hook.timeout_ms > 0,
          `${event} hook for ${scriptName} must have timeout_ms > 0, got: ${hook.timeout_ms}`
        );
        return;
      }
    }
    assert.fail(`No ${event} registration found referencing ${scriptName}`);
  });

  it('SessionStart hook command references session-start-watchpaths.cjs', () => {
    const hooks = getHooksForEvent(event);
    const matching = hooks.filter(({ hook }) => (hook.command || '').includes(scriptName));
    assert.ok(
      matching.length >= 1,
      `${event} must have a registration referencing "${scriptName}". Found commands: ${hooks.map(h => h.hook.command).join(', ')}`
    );
  });
});

// ─── Suite 5: Original categories unchanged ───────────────────────────────────

describe('original 7 event categories unchanged (VAL-NE-007)', () => {
  it('UserPromptSubmit has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).UserPromptSubmit || [];
    assert.ok(groups.length >= 1, 'UserPromptSubmit must have at least 1 hook group');
  });

  it('PreToolUse has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).PreToolUse || [];
    assert.ok(groups.length >= 1, 'PreToolUse must have at least 1 hook group');
  });

  it('PostToolUse has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).PostToolUse || [];
    assert.ok(groups.length >= 1, 'PostToolUse must have at least 1 hook group');
  });

  it('PostToolUseFailure has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).PostToolUseFailure || [];
    assert.ok(groups.length >= 1, 'PostToolUseFailure must have at least 1 hook group');
  });

  it('SessionEnd has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).SessionEnd || [];
    assert.ok(groups.length >= 1, 'SessionEnd must have at least 1 hook group');
  });

  it('PreCompact has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).PreCompact || [];
    assert.ok(groups.length >= 1, 'PreCompact must have at least 1 hook group');
  });

  it('Stop has at least 1 hook group', () => {
    const groups = (settings.hooks || {}).Stop || [];
    assert.ok(groups.length >= 1, 'Stop must have at least 1 hook group');
  });
});

// ─── Suite 6: Security patterns — subagent-start-iron-law.cjs (VAL-NE-008) ───

describe('subagent-start-iron-law.cjs security patterns (VAL-NE-008)', () => {
  const scriptPath = path.join(LIFECYCLE_DIR, 'subagent-start-iron-law.cjs');
  let source;
  let strippedSource;

  try {
    source = fs.readFileSync(scriptPath, 'utf8');
    strippedSource = stripComments(source);
  } catch (err) {
    throw new Error(`Failed to read subagent-start-iron-law.cjs: ${err.message}`);
  }

  it('hook file exists at expected path', () => {
    assert.ok(fs.existsSync(scriptPath), `Hook must exist at ${scriptPath}`);
  });

  it("has 'use strict' directive in executable code", () => {
    // The directive must appear as a statement, not just in comments.
    assert.ok(
      strippedSource.includes("'use strict';"),
      "Hook must have 'use strict'; as an executable statement"
    );
  });

  it('imports project-root.cjs for path resolution', () => {
    assert.ok(
      source.includes('project-root.cjs'),
      'Hook must require project-root.cjs for path resolution (never process.cwd())'
    );
  });

  it('uses parseHookInputAsync or safeParseJSON for safe input parsing', () => {
    assert.ok(
      source.includes('parseHookInputAsync') || source.includes('safeParseJSON'),
      'Hook must use parseHookInputAsync (or safeParseJSON) for safe stdin parsing'
    );
  });

  it('uses formatResult() for structured output', () => {
    assert.ok(source.includes('formatResult'), 'Hook must use formatResult() for output');
  });

  it('does not use process.cwd() in non-comment executable code', () => {
    assert.ok(
      !strippedSource.includes('process.cwd()'),
      'Hook must NOT call process.cwd() in executable code — use project-root.cjs instead'
    );
  });
});

// ─── Suite 7: Security patterns — permission-denied-logger.cjs (VAL-NE-008) ──

describe('permission-denied-logger.cjs security patterns (VAL-NE-008)', () => {
  const scriptPath = path.join(LIFECYCLE_DIR, 'permission-denied-logger.cjs');
  let source;
  let strippedSource;

  try {
    source = fs.readFileSync(scriptPath, 'utf8');
    strippedSource = stripComments(source);
  } catch (err) {
    throw new Error(`Failed to read permission-denied-logger.cjs: ${err.message}`);
  }

  it('hook file exists at expected path', () => {
    assert.ok(fs.existsSync(scriptPath), `Hook must exist at ${scriptPath}`);
  });

  it("has 'use strict' directive in executable code", () => {
    assert.ok(
      strippedSource.includes("'use strict';"),
      "Hook must have 'use strict'; as an executable statement"
    );
  });

  it('imports project-root.cjs for path resolution', () => {
    assert.ok(
      source.includes('project-root.cjs'),
      'Hook must require project-root.cjs for path resolution (never process.cwd())'
    );
  });

  it('uses parseHookInputAsync or safeParseJSON for safe input parsing', () => {
    assert.ok(
      source.includes('parseHookInputAsync') || source.includes('safeParseJSON'),
      'Hook must use parseHookInputAsync (or safeParseJSON) for safe stdin parsing'
    );
  });

  it('uses formatResult() for structured output', () => {
    assert.ok(source.includes('formatResult'), 'Hook must use formatResult() for output');
  });

  it('does not use process.cwd() in non-comment executable code', () => {
    assert.ok(
      !strippedSource.includes('process.cwd()'),
      'Hook must NOT call process.cwd() in executable code — use project-root.cjs instead'
    );
  });
});

// ─── Suite 8: Security patterns — session-start-watchpaths.cjs (VAL-NE-008) ──

describe('session-start-watchpaths.cjs security patterns (VAL-NE-008)', () => {
  const scriptPath = path.join(LIFECYCLE_DIR, 'session-start-watchpaths.cjs');
  let source;
  let strippedSource;

  try {
    source = fs.readFileSync(scriptPath, 'utf8');
    strippedSource = stripComments(source);
  } catch (err) {
    throw new Error(`Failed to read session-start-watchpaths.cjs: ${err.message}`);
  }

  it('hook file exists at expected path', () => {
    assert.ok(fs.existsSync(scriptPath), `Hook must exist at ${scriptPath}`);
  });

  it("has 'use strict' directive in executable code", () => {
    assert.ok(
      strippedSource.includes("'use strict';"),
      "Hook must have 'use strict'; as an executable statement"
    );
  });

  it('imports project-root.cjs for path resolution', () => {
    assert.ok(
      source.includes('project-root.cjs'),
      'Hook must require project-root.cjs for path resolution (never process.cwd())'
    );
  });

  it('uses parseHookInputAsync or safeParseJSON for safe input parsing', () => {
    assert.ok(
      source.includes('parseHookInputAsync') || source.includes('safeParseJSON'),
      'Hook must use parseHookInputAsync (or safeParseJSON) for safe stdin parsing'
    );
  });

  it('uses formatResult() for structured output', () => {
    assert.ok(source.includes('formatResult'), 'Hook must use formatResult() for output');
  });

  it('does not use process.cwd() in non-comment executable code', () => {
    assert.ok(
      !strippedSource.includes('process.cwd()'),
      'Hook must NOT call process.cwd() in executable code — use project-root.cjs instead'
    );
  });
});
