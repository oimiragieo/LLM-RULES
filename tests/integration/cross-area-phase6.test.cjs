#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 6 (Prompt Cache & Context Intelligence)
 * ============================================================================
 *
 * VAL-CROSS-006: 10 identical assembleSpawnPrompt() calls produce byte-identical
 *   output and zero cache-break events.
 * VAL-CROSS-007: Changing allowedTools triggers only toolsSection cache-break.
 *   Other sections remain cached (unchanged).
 * VAL-CROSS-008: After _clearSectionCache() + new snapshot, assembleSpawnPrompt()
 *   produces valid prompt with all sections.
 * VAL-CROSS-009: Circuit breaker + context-window-monitor produce combined
 *   additionalContext with both CRITICAL threshold warning and circuit-breaker advisory.
 * VAL-CROSS-010: Prompt prefix has stable SHA-256 hash across cache clears
 *   (simulating process restarts / post-compaction).
 * VAL-CROSS-011: End-to-end sequence — assemble, 3 turns >93%, circuit breaker,
 *   pre-compact, clear, reassemble, all valid.
 *
 * Mocks:
 *   - budget-tracker.json / edit-counter.json not directly read (functions called directly)
 *   - FLIGHT_RECORDER_PATH redirected to temp dirs for isolation
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Module paths ─────────────────────────────────────────────────────────────

const ASSEMBLER_MODULE_PATH = path.join(ROOT, '.claude', 'lib', 'spawn', 'prompt-assembler.cjs');
const FLIGHT_RECORDER_MODULE_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'monitoring',
  'flight-recorder.cjs'
);
const CONTEXT_MONITOR_MODULE_PATH = path.join(
  ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'context-window-monitor.cjs'
);

// ─── Load modules once ────────────────────────────────────────────────────────
// Module-level state is reset between tests using exported clear/reset functions.

const assembler = require(ASSEMBLER_MODULE_PATH);
const flightRecorder = require(FLIGHT_RECORDER_MODULE_PATH);
const contextMonitor = require(CONTEXT_MONITOR_MODULE_PATH);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a JSONL file and return array of parsed event objects.
 * Returns [] on any error or missing file.
 *
 * @param {string} filePath - Path to the JSONL file
 * @returns {Object[]}
 */
function readJSONL(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Compute a SHA-256 hex digest of a string.
 *
 * @param {string} str
 * @returns {string} Hex digest
 */
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Flush the flight recorder's async in-memory buffer to disk.
 * Call this after assembleSpawnPrompt() when you need to read JSONL events.
 */
function flushFlightRecorder() {
  if (flightRecorder._logBuffer && typeof flightRecorder._logBuffer.flushSync === 'function') {
    flightRecorder._logBuffer.flushSync();
  }
}

// ─── Stable test fixtures ─────────────────────────────────────────────────────

/** Tool set A — four tools sorted alphabetically. */
const TOOLS_A = ['Bash', 'Edit', 'Read', 'Write'];

/**
 * Tool set B — different four tools (shares 'Bash' and 'Read' with A,
 * swaps 'Edit'+'Write' for 'Glob'+'Grep').
 */
const TOOLS_B = ['Bash', 'Glob', 'Grep', 'Read'];

/**
 * Base options shared across all assembleSpawnPrompt() calls in this suite.
 * - includeMemory: false eliminates non-deterministic memory content
 * - agentType: 'developer' is a stable, well-known agent type
 * - presetId: null disables preset rule snippet loading
 */
const BASE_OPTIONS = Object.freeze({
  agentType: 'developer',
  basePrompt: 'You are a developer agent for cross-area integration testing.',
  includeMemory: false,
  presetId: null,
  maxToolsInPrompt: 10,
  maxSkillsInPrompt: 5,
});

// =============================================================================
// VAL-CROSS-006: Cache stability under repeated identical calls
// =============================================================================

describe('VAL-CROSS-006: Cache stability under repeated identical calls', () => {
  let tmpDir;
  let flightPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p6-006-'));
    flightPath = path.join(tmpDir, 'flight.jsonl');
    assembler._clearCache();
    contextMonitor._resetState();
  });

  after(() => {
    delete process.env.FLIGHT_RECORDER_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('10 identical calls produce byte-identical output', () => {
    assembler._clearCache();
    const opts = { ...BASE_OPTIONS, allowedTools: TOOLS_A };

    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(assembler.assembleSpawnPrompt(opts));
    }

    // All 10 outputs must be byte-identical to the first
    for (let i = 1; i < 10; i++) {
      assert.strictEqual(
        results[i],
        results[0],
        `Call ${i + 1} output must be byte-identical to call 1`
      );
    }
  });

  it('zero cache-break events emitted for 10 identical calls', () => {
    process.env.FLIGHT_RECORDER_PATH = flightPath;

    // Start with empty JSONL file
    fs.writeFileSync(flightPath, '', 'utf8');
    assembler._clearCache();

    const opts = { ...BASE_OPTIONS, allowedTools: TOOLS_A };
    for (let i = 0; i < 10; i++) {
      assembler.assembleSpawnPrompt(opts);
    }

    flushFlightRecorder();

    const allEvents = readJSONL(flightPath);
    const cacheBreaks = allEvents.filter(e => e.event === 'cache-break');

    assert.strictEqual(
      cacheBreaks.length,
      0,
      `Expected 0 cache-break events for 10 identical calls, got ${cacheBreaks.length}: ${JSON.stringify(cacheBreaks)}`
    );
  });
});

// =============================================================================
// VAL-CROSS-007: Cache invalidation on tool list change propagates correctly
// =============================================================================

describe('VAL-CROSS-007: Cache invalidation on tool list change propagates correctly', () => {
  let tmpDir;
  let flightPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p6-007-'));
    flightPath = path.join(tmpDir, 'flight.jsonl');
    process.env.FLIGHT_RECORDER_PATH = flightPath;
    assembler._clearCache();
  });

  after(() => {
    delete process.env.FLIGHT_RECORDER_PATH;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('changing allowedTools emits exactly one cache-break event listing only toolsSection', () => {
    // Ensure a clean slate
    fs.writeFileSync(flightPath, '', 'utf8');
    assembler._clearCache();

    // ── Call 1: Establish baseline with TOOLS_A ────────────────────────────
    assembler.assembleSpawnPrompt({ ...BASE_OPTIONS, allowedTools: TOOLS_A });
    flushFlightRecorder();

    const afterBaseline = readJSONL(flightPath).filter(e => e.event === 'cache-break');
    assert.strictEqual(
      afterBaseline.length,
      0,
      'No cache-break events expected after baseline (first) call'
    );

    // ── Call 2: Switch to TOOLS_B — only toolsSection should differ ────────
    assembler.assembleSpawnPrompt({ ...BASE_OPTIONS, allowedTools: TOOLS_B });
    flushFlightRecorder();

    const allBreaks = readJSONL(flightPath).filter(e => e.event === 'cache-break');
    assert.strictEqual(
      allBreaks.length,
      1,
      `Expected exactly 1 cache-break event after tool change, got ${allBreaks.length}`
    );

    const ev = allBreaks[0];
    assert.ok(Array.isArray(ev.changedSections), 'changedSections must be an array');
    assert.ok(
      ev.changedSections.includes('toolsSection'),
      `changedSections must include 'toolsSection'; got: ${JSON.stringify(ev.changedSections)}`
    );
    assert.strictEqual(
      ev.changedSections.length,
      1,
      `Only toolsSection should be listed; got: ${JSON.stringify(ev.changedSections)}`
    );
  });
});

// =============================================================================
// VAL-CROSS-008: Compaction cycle does not corrupt prompt assembly
// =============================================================================

describe('VAL-CROSS-008: Compaction cycle does not corrupt prompt assembly', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p6-008-'));
    assembler._clearCache();
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('all section markers present after _clearSectionCache() + new snapshot', () => {
    // Write a mock pre-compact snapshot (simulates a recent compaction event)
    const snapshotPath = path.join(tmpDir, 'pre-compact-snapshot.json');
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        editCount: 42,
        correctionCount: 3,
        promptCount: 15,
        originalIntent: 'Cross-area integration test session',
        driftEditCount: 2,
        activeFiles: ['src/index.js', 'tests/test.cjs'],
      }),
      'utf8'
    );

    // Clear section caches and hash baseline — simulates post-compaction state
    assembler._clearSectionCache();
    assembler._resetHashes();

    // Reassemble — must produce a fully valid prompt despite cleared caches
    const result = assembler.assembleSpawnPrompt({ ...BASE_OPTIONS, allowedTools: TOOLS_A });

    assert.ok(
      result.includes('## AVAILABLE_TOOLS'),
      'Assembled prompt must contain ## AVAILABLE_TOOLS section'
    );
    assert.ok(
      result.includes('## AVAILABLE_SKILLS'),
      'Assembled prompt must contain ## AVAILABLE_SKILLS section'
    );
    assert.ok(
      result.includes('## SKILL DISCOVERY PROTOCOL'),
      'Assembled prompt must contain ## SKILL DISCOVERY PROTOCOL section'
    );
    assert.ok(
      result.length > 200,
      `Prompt must be non-trivially long (> 200 chars); got ${result.length}`
    );
  });
});

// =============================================================================
// VAL-CROSS-009: Circuit breaker integrates with context-window-monitor
// =============================================================================

describe('VAL-CROSS-009: Circuit breaker integrates with context-window-monitor', () => {
  let tmpDir;
  let flightPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p6-009-'));
    flightPath = path.join(tmpDir, 'flight.jsonl');
    process.env.FLIGHT_RECORDER_PATH = flightPath;
    contextMonitor._resetState();
  });

  after(() => {
    delete process.env.FLIGHT_RECORDER_PATH;
    contextMonitor._resetState();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('3 consecutive turns at >=93% trips circuit breaker and returns advisory', () => {
    contextMonitor._resetState();

    let advisory;
    // Simulate 3 consecutive turns at 94% usage (>= 93% threshold)
    for (let turn = 1; turn <= 3; turn++) {
      advisory = contextMonitor.checkCircuitBreaker(0.94);
    }

    assert.ok(
      typeof advisory === 'string' && advisory.length > 0,
      'Circuit breaker advisory must be a non-empty string after 3 consecutive turns at >=93%'
    );
    assert.ok(
      advisory.includes('CIRCUIT BREAKER'),
      `Advisory must include "CIRCUIT BREAKER"; got: "${advisory.slice(0, 80)}..."`
    );
  });

  it('CRITICAL threshold warning + circuit breaker advisory combine into additionalContext', () => {
    contextMonitor._resetState();

    // Trip the circuit breaker
    let circuitBreakerAdvisory = null;
    for (let turn = 1; turn <= 3; turn++) {
      circuitBreakerAdvisory = contextMonitor.checkCircuitBreaker(0.94);
    }

    // Build CRITICAL threshold warning (94% > 90% → CRITICAL zone)
    const warningMessage = contextMonitor.buildWarningMessage(0.94, 188_000, 200_000);

    assert.ok(warningMessage !== null, 'Warning message must not be null at 94% usage');
    assert.ok(
      warningMessage.includes('CRITICAL'),
      `Warning message must include "CRITICAL" at 94%; got: "${warningMessage.slice(0, 80)}..."`
    );

    // Combine exactly as context-window-monitor's main() does
    const parts = [warningMessage, circuitBreakerAdvisory].filter(Boolean);
    assert.strictEqual(
      parts.length,
      2,
      'Both warning and circuit breaker advisory must be present'
    );

    const additionalContext = parts.join('\n\n');

    assert.ok(
      additionalContext.includes('CRITICAL'),
      'Combined additionalContext must contain "CRITICAL"'
    );
    assert.ok(
      additionalContext.includes('CIRCUIT BREAKER') ||
        additionalContext.includes('circuit-breaker'),
      'Combined additionalContext must reference circuit breaker'
    );
  });

  it('circuit breaker counter resets after usage drops below 93%', () => {
    contextMonitor._resetState();

    // Two turns at 94% (counter = 2, not yet tripped)
    contextMonitor.checkCircuitBreaker(0.94);
    contextMonitor.checkCircuitBreaker(0.94);

    // Drop to 80% — counter must reset to 0
    const resetResult = contextMonitor.checkCircuitBreaker(0.8);
    assert.strictEqual(resetResult, null, 'No advisory expected when usage drops below 93%');

    // Two more turns at 94% — counter is back at 2, not 4 (no trip at 2)
    contextMonitor.checkCircuitBreaker(0.94);
    const secondResult = contextMonitor.checkCircuitBreaker(0.94);
    assert.strictEqual(
      secondResult,
      null,
      'No advisory at counter=2; circuit breaker needs 3 consecutive turns'
    );
  });
});

// =============================================================================
// VAL-CROSS-010: Alphabetical sorting produces deterministic prefix hash
// =============================================================================

describe('VAL-CROSS-010: Alphabetical sorting produces deterministic prefix hash', () => {
  it('prompt SHA-256 hash is identical before and after cache clear', () => {
    // First assembly — cold caches, data read from disk
    assembler._clearCache();
    const prompt1 = assembler.assembleSpawnPrompt({ ...BASE_OPTIONS, allowedTools: TOOLS_A });
    const hash1 = sha256(prompt1);

    // Clear all caches (simulates process restart or post-compaction reset)
    assembler._clearCache();

    // Second assembly — same inputs, caches rebuilt from same disk data
    const prompt2 = assembler.assembleSpawnPrompt({ ...BASE_OPTIONS, allowedTools: TOOLS_A });
    const hash2 = sha256(prompt2);

    assert.strictEqual(
      hash1,
      hash2,
      'SHA-256 hash of assembled prompt must be identical after cache clear'
    );
    assert.strictEqual(
      prompt1,
      prompt2,
      'Assembled prompt must be byte-identical after cache clear'
    );
  });

  it('shuffled tool input produces same hash as sorted input (alphabetical normalization)', () => {
    // TOOLS_A is already sorted: ['Bash', 'Edit', 'Read', 'Write']
    // shuffledTools is the reverse — filterAndDescribeTools() must normalize both to the same order
    const shuffledTools = ['Write', 'Read', 'Edit', 'Bash'];

    assembler._clearCache();
    const promptSorted = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: TOOLS_A,
    });

    assembler._clearCache();
    const promptShuffled = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: shuffledTools,
    });

    assert.strictEqual(
      sha256(promptSorted),
      sha256(promptShuffled),
      'Shuffled and sorted tool input must produce byte-identical output (alphabetical normalization)'
    );
  });
});

// =============================================================================
// VAL-CROSS-011: End-to-end prompt assembly under context pressure
// =============================================================================

describe('VAL-CROSS-011: End-to-end prompt assembly under context pressure', () => {
  let tmpDir;
  let flightPath;

  /** 94% usage: triggers both CRITICAL threshold (>90%) and circuit breaker (>93%). */
  const HIGH_USAGE_PCT = 0.94;
  const TOKENS_USED = 188_000;
  const BUDGET = 200_000;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-p6-011-'));
    flightPath = path.join(tmpDir, 'flight.jsonl');
    process.env.FLIGHT_RECORDER_PATH = flightPath;
    assembler._clearCache();
    contextMonitor._resetState();
  });

  after(() => {
    delete process.env.FLIGHT_RECORDER_PATH;
    contextMonitor._resetState();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* EBUSY on Windows — ignored */
    }
  });

  it('full sequence: assemble → 3 turns >93% → circuit breaker → pre-compact → clear → reassemble', () => {
    // ── Step 1: Initial assembly ──────────────────────────────────────────────
    assembler._clearCache();
    contextMonitor._resetState();

    const initialPrompt = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: TOOLS_A,
    });

    assert.ok(
      initialPrompt.includes('## AVAILABLE_TOOLS'),
      'Step 1: AVAILABLE_TOOLS section must be present in initial prompt'
    );
    assert.ok(
      initialPrompt.includes('## AVAILABLE_SKILLS'),
      'Step 1: AVAILABLE_SKILLS section must be present in initial prompt'
    );
    assert.ok(
      initialPrompt.includes('## SKILL DISCOVERY PROTOCOL'),
      'Step 1: SKILL DISCOVERY PROTOCOL section must be present in initial prompt'
    );
    assert.ok(initialPrompt.length > 0, 'Step 1: initial prompt must be non-empty');

    // ── Step 2: Simulate 3 turns at >93% — circuit breaker trips on turn 3 ──
    let advisory = null;
    for (let turn = 1; turn <= 3; turn++) {
      advisory = contextMonitor.checkCircuitBreaker(HIGH_USAGE_PCT);
    }

    assert.ok(
      typeof advisory === 'string' && advisory.length > 0,
      'Step 2: Circuit breaker must trip after 3 consecutive turns at 94%'
    );
    assert.ok(
      advisory.includes('CIRCUIT BREAKER'),
      'Step 2: Advisory must reference "CIRCUIT BREAKER"'
    );

    // ── Step 3: Verify CRITICAL threshold warning at 94% ─────────────────────
    const warningMsg = contextMonitor.buildWarningMessage(HIGH_USAGE_PCT, TOKENS_USED, BUDGET);

    assert.ok(warningMsg !== null, 'Step 3: Warning message must not be null at 94%');
    assert.ok(warningMsg.includes('CRITICAL'), 'Step 3: Warning must be CRITICAL at 94% usage');

    // ── Step 4: Verify combined additionalContext ─────────────────────────────
    const parts = [warningMsg, advisory].filter(Boolean);
    const additionalContext = parts.join('\n\n');

    assert.ok(
      additionalContext.includes('CRITICAL'),
      'Step 4: additionalContext must contain "CRITICAL"'
    );
    assert.ok(
      additionalContext.includes('CIRCUIT BREAKER') ||
        additionalContext.includes('circuit-breaker'),
      'Step 4: additionalContext must reference circuit breaker'
    );

    // ── Step 5: Simulate pre-compact (write mock snapshot to temp dir) ────────
    const snapshotPath = path.join(tmpDir, 'pre-compact-snapshot.json');
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        editCount: 100,
        correctionCount: 5,
        promptCount: 50,
        originalIntent: 'End-to-end integration test under context pressure',
        driftEditCount: 3,
        activeFiles: ['src/main.js', 'tests/e2e.cjs'],
      }),
      'utf8'
    );

    // ── Step 6: Clear all caches (post-compaction reset) ──────────────────────
    assembler._clearCache();

    // ── Step 7: Reassemble — must produce a valid prompt ─────────────────────
    const postClearPrompt = assembler.assembleSpawnPrompt({
      ...BASE_OPTIONS,
      allowedTools: TOOLS_A,
    });

    assert.ok(
      postClearPrompt.includes('## AVAILABLE_TOOLS'),
      'Step 7: AVAILABLE_TOOLS section must be present after cache clear'
    );
    assert.ok(
      postClearPrompt.includes('## AVAILABLE_SKILLS'),
      'Step 7: AVAILABLE_SKILLS section must be present after cache clear'
    );
    assert.ok(
      postClearPrompt.includes('## SKILL DISCOVERY PROTOCOL'),
      'Step 7: SKILL DISCOVERY PROTOCOL section must be present after cache clear'
    );
    assert.ok(postClearPrompt.length > 0, 'Step 7: post-clear prompt must be non-empty');

    // ── Step 8: Byte-identity assertion ──────────────────────────────────────
    assert.strictEqual(
      postClearPrompt,
      initialPrompt,
      'Step 8: Post-clear prompt must be byte-identical to initial prompt (deterministic assembly)'
    );
  });
});
