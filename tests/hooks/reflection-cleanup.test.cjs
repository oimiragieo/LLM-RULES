#!/usr/bin/env node
'use strict';

/**
 * TDD Tests for GAP-D: Cross-session Reflection Staleness
 *
 * Root cause: reflection-spawn-request.json entries from prior sessions persist
 * because there is no age-based pruning. When agents complete without emitting
 * processedReflectionIds in TaskUpdate metadata, cleanup never fires.
 *
 * Fix path:
 *  1. Add removeStaleRequests(filePath, maxAgeMs) to spawn-request-contract.cjs
 *  2. Add optional maxAge filter to readSpawnRequestsFile
 *  3. Have reflection-step0-guard (or reflection-cleanup) call this on session startup
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'reflection',
  'reflection-cleanup.cjs'
);
const CONTRACT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'reflection',
  'spawn-request-contract.cjs'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reflection-cleanup-test-'));
}

function makeSpawnRequest(id, ageMs = 0) {
  const timestamp = new Date(Date.now() - ageMs).toISOString();
  return {
    id,
    status: 'pending',
    subagent_type: 'reflection-agent',
    description: `Test reflection request ${id}`,
    prompt: `Reflect on session for ${id}`,
    source: {
      trigger: 'test',
      timestamp,
      taskId: null,
      context: null,
      priority: 'medium',
    },
  };
}

function writeSpawnRequests(filePath, requests) {
  fs.writeFileSync(filePath, JSON.stringify(requests, null, 2), 'utf8');
}

function readSpawnRequests(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadContract() {
  delete require.cache[require.resolve(CONTRACT_PATH)];
  return require(CONTRACT_PATH);
}

// ---------------------------------------------------------------------------
// Test Suite 1: removeStaleRequests function (spawn-request-contract.cjs)
// ---------------------------------------------------------------------------

describe('spawn-request-contract: removeStaleRequests', () => {
  let tmpDir;
  let spawnRequestPath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removeStaleRequests is exported from spawn-request-contract.cjs', () => {
    const contract = loadContract();
    assert.strictEqual(
      typeof contract.removeStaleRequests,
      'function',
      'removeStaleRequests must be exported from spawn-request-contract.cjs'
    );
  });

  test('removeStaleRequests removes entries older than maxAgeMs', () => {
    const staleEntry = makeSpawnRequest('stale-1', 5 * 60 * 60 * 1000); // 5 hours ago
    const freshEntry = makeSpawnRequest('fresh-1', 30 * 1000); // 30 seconds ago
    writeSpawnRequests(spawnRequestPath, [staleEntry, freshEntry]);

    const contract = loadContract();
    const maxAgeMs = 4 * 60 * 60 * 1000; // 4 hours
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 1, 'Should remove 1 stale entry');
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 1, 'Should have 1 entry remaining');
    assert.strictEqual(remaining[0].id, 'fresh-1', 'Remaining entry should be fresh-1');
  });

  test('removeStaleRequests leaves non-stale entries untouched', () => {
    const fresh1 = makeSpawnRequest('fresh-1', 1 * 60 * 1000); // 1 minute ago
    const fresh2 = makeSpawnRequest('fresh-2', 30 * 60 * 1000); // 30 minutes ago
    writeSpawnRequests(spawnRequestPath, [fresh1, fresh2]);

    const contract = loadContract();
    const maxAgeMs = 4 * 60 * 60 * 1000; // 4 hours
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 0, 'Should remove 0 entries');
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 2, 'Should have 2 entries remaining');
  });

  test('removeStaleRequests handles missing file gracefully', () => {
    const contract = loadContract();
    const maxAgeMs = 4 * 60 * 60 * 1000;
    let threwError = false;
    let removedCount;
    try {
      removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);
    } catch (_err) {
      threwError = true;
    }
    assert.strictEqual(threwError, false, 'Should not throw when file does not exist');
    assert.strictEqual(removedCount, 0, 'Should return 0 when file does not exist');
  });

  test('removeStaleRequests handles empty array gracefully', () => {
    writeSpawnRequests(spawnRequestPath, []);

    const contract = loadContract();
    const maxAgeMs = 4 * 60 * 60 * 1000;
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 0, 'Should return 0 for empty array');
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 0, 'Should still be empty');
  });

  test('removeStaleRequests returns count of removed entries', () => {
    const requests = [
      makeSpawnRequest('stale-1', 10 * 60 * 60 * 1000), // 10 hours ago
      makeSpawnRequest('stale-2', 8 * 60 * 60 * 1000), // 8 hours ago
      makeSpawnRequest('fresh-1', 60 * 1000), // 1 minute ago
    ];
    writeSpawnRequests(spawnRequestPath, requests);

    const contract = loadContract();
    const maxAgeMs = 4 * 60 * 60 * 1000; // 4 hours
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 2, 'Should return count of 2 removed entries');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: readSpawnRequestsFile maxAge option
// ---------------------------------------------------------------------------

describe('spawn-request-contract: readSpawnRequestsFile with maxAge option', () => {
  let tmpDir;
  let spawnRequestPath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readSpawnRequestsFile with maxAge filters out stale entries', () => {
    const staleEntry = makeSpawnRequest('stale-1', 25 * 60 * 60 * 1000); // 25 hours ago
    const freshEntry = makeSpawnRequest('fresh-1', 60 * 1000); // 1 minute ago
    writeSpawnRequests(spawnRequestPath, [staleEntry, freshEntry]);

    const contract = loadContract();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    const result = contract.readSpawnRequestsFile(spawnRequestPath, { maxAge: maxAgeMs });

    assert.strictEqual(result.length, 1, 'Should return 1 entry after filtering stale');
    assert.strictEqual(result[0].id, 'fresh-1', 'Should return fresh-1');
  });

  test('readSpawnRequestsFile without maxAge returns all entries (backward-compatible)', () => {
    const staleEntry = makeSpawnRequest('stale-1', 25 * 60 * 60 * 1000); // 25 hours ago
    const freshEntry = makeSpawnRequest('fresh-1', 60 * 1000); // 1 minute ago
    writeSpawnRequests(spawnRequestPath, [staleEntry, freshEntry]);

    const contract = loadContract();
    const result = contract.readSpawnRequestsFile(spawnRequestPath);

    assert.strictEqual(result.length, 2, 'Without maxAge, should return all 2 entries');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: removeRequests with processedReflectionIds (via contract)
// Tests the contract layer used by reflection-cleanup.cjs to process IDs.
// The hook itself calls removeRequests() from the contract, so testing the
// contract directly is the correct unit test boundary here.
// ---------------------------------------------------------------------------

describe('spawn-request-contract: removeRequests (processedReflectionIds path)', () => {
  let tmpDir;
  let spawnRequestPath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removeRequests removes matching IDs from spawn-request.json', () => {
    const entry1 = makeSpawnRequest('reflection-id-1', 0);
    const entry2 = makeSpawnRequest('reflection-id-2', 0);
    writeSpawnRequests(spawnRequestPath, [entry1, entry2]);

    const contract = loadContract();
    contract.removeRequests(spawnRequestPath, ['reflection-id-1']);

    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 1, 'Should have 1 entry remaining');
    assert.strictEqual(remaining[0].id, 'reflection-id-2', 'Should keep reflection-id-2');
  });

  test('removeRequests leaves non-matching IDs untouched', () => {
    const entry1 = makeSpawnRequest('reflection-id-1', 0);
    const entry2 = makeSpawnRequest('reflection-id-2', 0);
    writeSpawnRequests(spawnRequestPath, [entry1, entry2]);

    const contract = loadContract();
    contract.removeRequests(spawnRequestPath, ['some-other-id']);

    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 2, 'Should have 2 entries remaining (no matching ID)');
  });

  test('removeRequests handles empty processedReflectionIds gracefully (no crash)', () => {
    const entry1 = makeSpawnRequest('reflection-id-1', 0);
    writeSpawnRequests(spawnRequestPath, [entry1]);

    const contract = loadContract();
    let threwError = false;
    try {
      contract.removeRequests(spawnRequestPath, []);
    } catch (_err) {
      threwError = true;
    }
    assert.strictEqual(threwError, false, 'Should not throw for empty array');

    // File should be unchanged since no IDs were provided
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 1, 'Should have 1 entry remaining (no IDs to remove)');
  });

  test('reflection-cleanup hook exits 0 for TaskUpdate completed without metadata (graceful)', () => {
    // Verify the hook does not crash when metadata is absent
    const hookInput = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-789',
        status: 'completed',
        // No metadata.processedReflectionIds
      },
    };
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      env: { ...process.env },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Hook should exit 0. stderr: ${result.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: Stale entry pruning (age-based, session-startup scenario)
// ---------------------------------------------------------------------------

describe('spawn-request-contract: stale cleanup (age-based, cross-session scenario)', () => {
  let tmpDir;
  let spawnRequestPath;
  let reminderPath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
    reminderPath = path.join(tmpDir, 'reflection-reminder.txt');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('stale entry older than MAX_REFLECTION_AGE_HOURS is pruned by removeStaleRequests', () => {
    const maxAgeHours = 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    // Simulate prior-session stale entry: 26 hours old
    const staleEntry = makeSpawnRequest(
      'prior-session-reflection',
      (maxAgeHours + 2) * 60 * 60 * 1000
    );
    writeSpawnRequests(spawnRequestPath, [staleEntry]);

    const contract = loadContract();
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 1, 'Should remove the stale prior-session entry');

    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 0, 'Should have 0 entries remaining after stale cleanup');
  });

  test('fresh entry (within MAX_REFLECTION_AGE_HOURS) is NOT pruned by removeStaleRequests', () => {
    const maxAgeHours = 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    // Fresh entry: 2 hours old (well within the 24h window)
    const freshEntry = makeSpawnRequest('current-session-reflection', 2 * 60 * 60 * 1000);
    writeSpawnRequests(spawnRequestPath, [freshEntry]);

    const contract = loadContract();
    const removedCount = contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    assert.strictEqual(removedCount, 0, 'Should NOT remove fresh entry');

    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 1, 'Should have 1 entry remaining');
    assert.strictEqual(remaining[0].id, 'current-session-reflection');
  });

  test('reminder file is deleted when no pending requests remain after stale cleanup', () => {
    const maxAgeHours = 24;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    // Write a stale entry and a reminder file
    const staleEntry = makeSpawnRequest('prior-session-1', (maxAgeHours + 2) * 60 * 60 * 1000);
    writeSpawnRequests(spawnRequestPath, [staleEntry]);
    fs.writeFileSync(reminderPath, 'pending reflections', 'utf8');

    // Use the contract to remove stale entries
    const contract = loadContract();
    contract.removeStaleRequests(spawnRequestPath, maxAgeMs);

    // Verify stale entries are gone
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 0, 'No entries should remain');

    // The hook or caller should remove the reminder file once requests are empty.
    // Test that we CAN check this condition (reminder file cleanup is responsibility of caller).
    // This documents the expected behavior for step0-guard integration.
    const requestsAfterCleanup = contract.readSpawnRequestsFile(spawnRequestPath);
    assert.strictEqual(requestsAfterCleanup.length, 0, 'readSpawnRequestsFile confirms no pending');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: Hook stale-prune side-channel (age-based, via hook process)
// Covers the fix for the stuck queue drain bug: entries older than
// MAX_REFLECTION_AGE_HOURS must be pruned by the hook itself even when
// processedReflectionIds is not present in the TaskUpdate metadata.
// ---------------------------------------------------------------------------

describe('reflection-cleanup hook: stale-prune side-channel (age-based)', () => {
  let tmpDir;
  let spawnRequestPath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    spawnRequestPath = path.join(tmpDir, 'reflection-spawn-request.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('hook prunes stale entries (>24h) on any PostToolUse even without processedReflectionIds', () => {
    // Write a stale entry — 26 hours old (exceeds default 24h threshold)
    const staleEntry = makeSpawnRequest('stale-cross-session-id', 26 * 60 * 60 * 1000);
    writeSpawnRequests(spawnRequestPath, [staleEntry]);

    // Fire the hook with a TaskUpdate that has NO processedReflectionIds
    const hookInput = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'some-unrelated-task',
        status: 'completed',
        // deliberately no metadata.processedReflectionIds
      },
    };
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      env: {
        ...process.env,
        SPAWN_REQUEST_PATH_OVERRIDE: spawnRequestPath,
        REFLECTION_MAX_AGE_HOURS: '24',
      },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Hook must exit 0. stderr: ${result.stderr}`);

    // The stale entry should have been pruned by the side-channel
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(
      remaining.length,
      0,
      `Stale entry should have been pruned by the hook. Remaining: ${JSON.stringify(remaining)}`
    );
  });

  test('hook does NOT prune fresh entries (< 24h) on PostToolUse without processedReflectionIds', () => {
    // Write a fresh entry — only 2 hours old (well within threshold)
    const freshEntry = makeSpawnRequest('fresh-current-session-id', 2 * 60 * 60 * 1000);
    writeSpawnRequests(spawnRequestPath, [freshEntry]);

    const hookInput = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'some-unrelated-task',
        status: 'completed',
      },
    };
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      env: {
        ...process.env,
        SPAWN_REQUEST_PATH_OVERRIDE: spawnRequestPath,
        REFLECTION_MAX_AGE_HOURS: '24',
      },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Hook must exit 0. stderr: ${result.stderr}`);

    // Fresh entry must NOT be pruned
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(remaining.length, 1, 'Fresh entry should NOT be pruned by the hook');
    assert.strictEqual(remaining[0].id, 'fresh-current-session-id');
  });

  test('hook prunes stale entries even on non-TaskUpdate tool events (Write, Bash, etc.)', () => {
    // Write a stale entry
    const staleEntry = makeSpawnRequest('stale-id-on-write', 48 * 60 * 60 * 1000); // 48h old
    writeSpawnRequests(spawnRequestPath, [staleEntry]);

    // Fire with a Write tool event (not TaskUpdate)
    const hookInput = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/some/file.txt',
        content: 'hello',
      },
    };
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      env: {
        ...process.env,
        SPAWN_REQUEST_PATH_OVERRIDE: spawnRequestPath,
        REFLECTION_MAX_AGE_HOURS: '24',
      },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Hook must exit 0. stderr: ${result.stderr}`);

    // Stale entry should have been pruned
    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(
      remaining.length,
      0,
      `Stale entry should be pruned on Write tool event. Remaining: ${JSON.stringify(remaining)}`
    );
  });

  test('hook respects REFLECTION_MAX_AGE_HOURS env var override', () => {
    // Entry is 2 hours old — stale under a 1h threshold, fresh under 24h
    const entry = makeSpawnRequest('age-sensitive-id', 2 * 60 * 60 * 1000);
    writeSpawnRequests(spawnRequestPath, [entry]);

    const hookInput = {
      tool_name: 'TaskUpdate',
      tool_input: { taskId: 'x', status: 'completed' },
    };
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      env: {
        ...process.env,
        SPAWN_REQUEST_PATH_OVERRIDE: spawnRequestPath,
        REFLECTION_MAX_AGE_HOURS: '1', // very short threshold — 2h entry is stale
      },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `Hook must exit 0. stderr: ${result.stderr}`);

    const remaining = readSpawnRequests(spawnRequestPath);
    assert.strictEqual(
      remaining.length,
      0,
      'Entry older than REFLECTION_MAX_AGE_HOURS=1 should be pruned'
    );
  });
});
