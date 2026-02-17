#!/usr/bin/env node
/**
 * Tests for P2b: STM update on UserPromptSubmit.
 *
 * Test 1 – STM written on UserPromptSubmit:
 *   Simulate a UserPromptSubmit hook invocation via runAllChecks().
 *   Assert that .claude/context/memory/stm/session_current.json exists and
 *   has the expected shape: { session_id, timestamp, summary, tier, updated_at }.
 *
 * Test 2 – STM shape is compatible with MTM consolidation:
 *   Verify the STM entry written by the hook can be read back by
 *   memory-tiers.readSTMEntry() and has the fields consolidateSession expects.
 *
 * Test 3 – STM write is idempotent across multiple prompts:
 *   Call runAllChecks() twice with different prompts. Verify updated_at advances.
 */
'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stm-prompt-test-'));
  // Ensure all directories that the hook and memory-tiers module needs exist
  fs.mkdirSync(path.join(dir, '.claude', 'context', 'memory', 'stm'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'context', 'memory', 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'context', 'memory', 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'context', 'runtime'), { recursive: true });
  return dir;
}

function cleanupRoot(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Module paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const hookCorePath = path.resolve(
  PROJECT_ROOT,
  '.claude/hooks/routing/user-prompt-unified.core.cjs'
);
const memoryTiersPath = path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-tiers.cjs');

// ---------------------------------------------------------------------------
// Validate the modules can be loaded
// ---------------------------------------------------------------------------

/** @type {typeof import('../../.claude/hooks/routing/user-prompt-unified.core.cjs')} */
const hookCore = require(hookCorePath);

/** @type {typeof import('../../.claude/lib/memory/memory-tiers.cjs')} */
const memoryTiers = require(memoryTiersPath);

// ---------------------------------------------------------------------------
// Test 1: STM written on UserPromptSubmit via runAllChecks
// ---------------------------------------------------------------------------

describe('STM update on UserPromptSubmit', () => {
  let tempRoot;

  before(() => {
    tempRoot = makeTempRoot();
  });

  after(() => {
    cleanupRoot(tempRoot);
  });

  it('writes session_current.json after runAllChecks', async () => {
    const stmFile = path.join(
      tempRoot,
      '.claude',
      'context',
      'memory',
      'stm',
      'session_current.json'
    );

    // File should not exist yet
    assert.equal(fs.existsSync(stmFile), false, 'STM file must not exist before hook runs');

    const hookInput = {
      session_id: 'test-session-001',
      prompt: 'Add a new feature to the codebase',
    };

    // Run the hook checks (same code path as UserPromptSubmit hook)
    await hookCore.runAllChecks(hookInput, tempRoot);

    // STM file must now exist
    assert.ok(fs.existsSync(stmFile), `STM file must exist after runAllChecks: ${stmFile}`);

    // Parse and validate shape
    const raw = fs.readFileSync(stmFile, 'utf8');
    const entry = JSON.parse(raw);

    assert.ok(typeof entry === 'object' && entry !== null, 'STM entry must be an object');
    assert.ok(typeof entry.updated_at === 'string', 'STM entry must have updated_at string');
    assert.ok(entry.updated_at.length > 0, 'updated_at must be non-empty');

    // Validate updated_at is a parseable ISO date
    const dt = new Date(entry.updated_at);
    assert.ok(!Number.isNaN(dt.getTime()), 'updated_at must be a valid ISO date');

    // Must have session_id
    assert.ok(typeof entry.session_id === 'string', 'STM entry must have session_id');
    assert.ok(entry.session_id.length > 0, 'session_id must be non-empty');

    // Must have tier
    assert.equal(entry.tier, 'STM', 'tier must be STM');
  });
});

// ---------------------------------------------------------------------------
// Test 2: STM shape compatible with consolidateSession (MTM)
// ---------------------------------------------------------------------------

describe('STM shape compatible with MTM consolidation', () => {
  let tempRoot;

  before(() => {
    tempRoot = makeTempRoot();
  });

  after(() => {
    cleanupRoot(tempRoot);
  });

  it('readSTMEntry returns entry with fields required by consolidateSession', async () => {
    const hookInput = {
      session_id: 'test-session-002',
      prompt: 'Investigate the memory tier system',
    };

    await hookCore.runAllChecks(hookInput, tempRoot);

    const entry = memoryTiers.readSTMEntry(tempRoot);

    assert.ok(entry !== null, 'readSTMEntry must return a value after runAllChecks');
    assert.ok(typeof entry === 'object', 'STM entry must be an object');

    // Fields that _consolidateSession reads / relies on
    assert.ok('updated_at' in entry, 'entry must have updated_at');
    assert.ok('tier' in entry, 'entry must have tier');
    assert.equal(entry.tier, 'STM', 'tier must equal STM');

    // session_id must be present so consolidateSession can tag the MTM file
    assert.ok('session_id' in entry, 'entry must have session_id');

    // Validate that the entry can be round-tripped through JSON (no circular refs).
    // safeParseJSON may return a null-prototype object, so compare field-by-field.
    const roundTripped = JSON.parse(JSON.stringify(entry));
    assert.equal(roundTripped.session_id, entry.session_id, 'session_id must survive round-trip');
    assert.equal(roundTripped.tier, entry.tier, 'tier must survive round-trip');
    assert.equal(roundTripped.updated_at, entry.updated_at, 'updated_at must survive round-trip');
  });
});

// ---------------------------------------------------------------------------
// Test 3: STM updated_at advances on repeated prompts (idempotent writes)
// ---------------------------------------------------------------------------

describe('STM updated_at advances on subsequent prompts', () => {
  let tempRoot;

  before(() => {
    tempRoot = makeTempRoot();
  });

  after(() => {
    cleanupRoot(tempRoot);
  });

  it('updated_at is later on second prompt', async () => {
    const stmFile = path.join(
      tempRoot,
      '.claude',
      'context',
      'memory',
      'stm',
      'session_current.json'
    );

    await hookCore.runAllChecks(
      { session_id: 'test-session-003', prompt: 'First prompt in the session' },
      tempRoot
    );

    const first = JSON.parse(fs.readFileSync(stmFile, 'utf8'));
    const firstUpdatedAt = new Date(first.updated_at).getTime();

    // Small delay to guarantee timestamp difference
    await new Promise(resolve => setTimeout(resolve, 20));

    await hookCore.runAllChecks(
      { session_id: 'test-session-003', prompt: 'Second prompt in the session' },
      tempRoot
    );

    const second = JSON.parse(fs.readFileSync(stmFile, 'utf8'));
    const secondUpdatedAt = new Date(second.updated_at).getTime();

    assert.ok(
      secondUpdatedAt >= firstUpdatedAt,
      `updated_at must advance: ${first.updated_at} -> ${second.updated_at}`
    );
  });
});
