#!/usr/bin/env node
'use strict';

/**
 * TDD Test: reflection-step0-guard staleness pruning
 *
 * BUG-F: _MAX_REFLECTION_AGE_HOURS is defined but never called in main().
 * Stale reflection entries accumulate across sessions and never get pruned.
 *
 * This test verifies that entries older than MAX_REFLECTION_AGE_HOURS hours
 * are pruned before the guard evaluates pending reflections.
 *
 * Entry format must match the schema (reflection-spawn-request.schema.json):
 * - id, subagent_type, prompt, source.{trigger, timestamp, taskId, context, priority}
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'reflection',
  'reflection-step0-guard.cjs'
);

const SPAWN_REQUEST_PATH = path.normalize(
  `${PROJECT_ROOT}/.claude/context/runtime/reflection-spawn-request.json`
);

/**
 * Build a valid schema-compliant spawn request entry.
 * The timestamp must be in source.timestamp (not the top-level field).
 */
function makeEntry(id, sourceTimestamp) {
  return {
    id,
    status: 'pending',
    subagent_type: 'reflection-agent',
    description: 'Test reflection request',
    prompt: 'Run reflection for session test',
    source: {
      trigger: 'session-end',
      timestamp: sourceTimestamp,
      taskId: null,
      context: null,
      priority: 'medium',
    },
  };
}

/**
 * Build a preload script that intercepts fs calls to spawn-request.json
 * and injects synthetic entries. Also intercepts writes to capture pruning.
 *
 * @param {Array} entries - The entries to inject
 */
function buildPreloadScript(entries) {
  const entriesJson = JSON.stringify(entries);
  // Normalize to forward slashes and lowercase for cross-platform comparison
  const normalizedTarget = SPAWN_REQUEST_PATH.replace(/\\/g, '/').toLowerCase();

  return `
'use strict';
const fs = require('node:fs');
const origExists = fs.existsSync.bind(fs);
const origRead = fs.readFileSync.bind(fs);
const origWrite = fs.writeFileSync.bind(fs);
const origAtomicWrite = null;

const TARGET = ${JSON.stringify(normalizedTarget)};
function norm(f) { return String(f).replace(/\\\\/g, '/').toLowerCase(); }

let writtenContent = null;

fs.existsSync = function(f, ...r) {
  if (norm(f) === TARGET) return true;
  return origExists(f, ...r);
};

fs.readFileSync = function(f, ...r) {
  if (norm(f) === TARGET) {
    if (writtenContent !== null) {
      return writtenContent;
    }
    return ${JSON.stringify(entriesJson)};
  }
  return origRead(f, ...r);
};

fs.writeFileSync = function(f, c, ...r) {
  if (norm(f) === TARGET) {
    writtenContent = String(c);
    return;
  }
  return origWrite(f, c, ...r);
};

// Also intercept the atomic-write module since it may use a different path
const Module = require('module');
const origLoad = Module._load;
Module._load = function(request, parent, isMain) {
  const mod = origLoad.call(this, request, parent, isMain);
  return mod;
};
`;
}

test('staleness pruning: stale entries older than MAX_REFLECTION_AGE_HOURS are pruned and not enforced', () => {
  const maxAgeHours = 1;
  // Create entries with source.timestamp that is clearly stale (maxAgeHours+2 hours ago)
  const staleTimestamp = new Date(Date.now() - (maxAgeHours + 2) * 60 * 60 * 1000).toISOString();

  const staleEntries = [
    makeEntry('stale-req-1', staleTimestamp),
    makeEntry('stale-req-2', staleTimestamp),
  ];

  const preloadPath = path.join(
    os.tmpdir(),
    `reflection-step0-staleness-preload-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`
  );

  fs.writeFileSync(preloadPath, buildPreloadScript(staleEntries), 'utf8');

  try {
    const payload = JSON.stringify({
      tool_name: 'TaskList',
      tool_input: {},
      session_id: 'test-staleness',
      hook_event_name: 'PreToolUse',
    });

    const result = spawnSync('node', ['--require', preloadPath, GUARD_PATH], {
      env: {
        ...process.env,
        REFLECTION_STEP0_ENFORCEMENT: 'block',
        MAX_REFLECTION_AGE_HOURS: String(maxAgeHours),
        // Disable the reflection log lookups to isolate staleness pruning
        REFLECTION_ENABLED: 'true',
        REFLECTION_GHOST_SUPPRESS_HOURS: '9999',
      },
      input: payload,
      encoding: 'utf8',
    });

    // After staleness pruning removes the stale entries, the guard should see
    // 0 pending reflections and exit 0 (allow TaskList through).
    assert.equal(
      result.status,
      0,
      `Guard should exit 0 after pruning all stale entries, but got exit code ${result.status}. ` +
        `stderr=${result.stderr || ''} stdout=${result.stdout || ''}`
    );

    // Should NOT emit a blocking or warning message about pending reflections.
    assert.ok(
      !String(result.stdout || '').includes('STEP 0 REQUIRED'),
      `Guard should not block after pruning stale entries, but stdout was: ${result.stdout || ''}`
    );
    assert.ok(
      !String(result.stdout || '').includes('pending reflection request'),
      `Guard should not warn about pruned stale entries, but stdout was: ${result.stdout || ''}`
    );
  } finally {
    fs.rmSync(preloadPath, { force: true });
  }
});

test('staleness pruning: fresh entries within MAX_REFLECTION_AGE_HOURS are NOT pruned', () => {
  const maxAgeHours = 24;
  // Create a fresh entry (10 minutes ago — well within 24 hours)
  const freshTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const freshEntries = [makeEntry('fresh-req-1', freshTimestamp)];

  const preloadPath = path.join(
    os.tmpdir(),
    `reflection-step0-fresh-preload-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`
  );

  fs.writeFileSync(preloadPath, buildPreloadScript(freshEntries), 'utf8');

  try {
    const payload = JSON.stringify({
      tool_name: 'TaskList',
      tool_input: {},
      session_id: 'test-fresh-entries',
      hook_event_name: 'PreToolUse',
    });

    const result = spawnSync('node', ['--require', preloadPath, GUARD_PATH], {
      env: {
        ...process.env,
        REFLECTION_STEP0_ENFORCEMENT: 'warn',
        MAX_REFLECTION_AGE_HOURS: String(maxAgeHours),
        REFLECTION_GHOST_SUPPRESS_HOURS: '9999',
      },
      input: payload,
      encoding: 'utf8',
    });

    // Fresh entry should NOT be pruned, so the guard should see 1 pending
    // and emit a warning (we use warn mode so it does not block, exit 0).
    assert.equal(
      result.status,
      0,
      `Guard in warn mode should exit 0, got ${result.status}. stderr=${result.stderr || ''}`
    );

    // The warning about pending reflections should be present (entry was NOT pruned).
    assert.ok(
      String(result.stdout || '').includes('pending reflection request'),
      `Guard should warn about fresh (non-pruned) entry, but stdout was: ${result.stdout || ''}`
    );
  } finally {
    fs.rmSync(preloadPath, { force: true });
  }
});
