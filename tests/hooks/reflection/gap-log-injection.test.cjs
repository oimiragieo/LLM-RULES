#!/usr/bin/env node
/**
 * Integration tests: gap log injection into reflection prompts
 *
 * Verifies that reflection-queue-processor.cjs reads session-gap-log.jsonl
 * and injects its content into the prompt built by buildTaskPrompt() (called
 * indirectly via the exported generateSpawnRequest / generateSpawnInstruction).
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Use a unique temp path per test run to avoid conflicts when suites run in parallel
const GAP_LOG_PATH = path.join(
  os.tmpdir(),
  `gap-log-injection-test-${crypto.randomBytes(6).toString('hex')}.jsonl`
);

// Set the override BEFORE requiring the module so readSessionGapLog() uses it
process.env.GAP_LOG_PATH_OVERRIDE = GAP_LOG_PATH;

// The module caches PROJECT_ROOT at load time; require after we know the path.
const {
  generateSpawnInstruction,
  generateSpawnRequest,
} = require('../../../.claude/hooks/reflection/reflection-queue-processor.cjs');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return a minimal queue entry that triggers task_completion logic */
function makeEntry(overrides = {}) {
  return Object.assign(
    {
      trigger: 'task_completion',
      taskId: 'task-test-gap',
      timestamp: '2026-02-21T00:00:00Z',
      priority: 'medium',
    },
    overrides
  );
}

/** Sample gap log lines as they would appear in session-gap-log.jsonl */
const SAMPLE_GAP_LINE_1 = JSON.stringify({
  timestamp: '2026-02-21T00:00:00Z',
  type: 'retry',
  taskId: 'task-5',
  agent: 'artifact-integrator',
  description: 'artifact-integrator produced placeholder report',
  context: 'skill-catalog.md missing entries',
});

const SAMPLE_GAP_LINE_2 = JSON.stringify({
  timestamp: '2026-02-21T00:01:00Z',
  type: 'integration_gap',
  taskId: 'task-11',
  agent: 'developer',
  description: '6 skills missing from agent frontmatter after skill-creator run',
  context: 'developer.md, devops.md, qa.md affected',
});

// ── fixtures ──────────────────────────────────────────────────────────────────

let previousGapLogContent = null;

function backupGapLog() {
  try {
    if (fs.existsSync(GAP_LOG_PATH)) {
      previousGapLogContent = fs.readFileSync(GAP_LOG_PATH, 'utf8');
    } else {
      previousGapLogContent = null;
    }
  } catch (_e) {
    previousGapLogContent = null;
  }
}

function restoreGapLog() {
  try {
    if (previousGapLogContent === null) {
      // File didn't exist before — remove what the test wrote
      if (fs.existsSync(GAP_LOG_PATH)) {
        fs.unlinkSync(GAP_LOG_PATH);
      }
    } else {
      fs.writeFileSync(GAP_LOG_PATH, previousGapLogContent, 'utf8');
    }
  } catch (_e) {
    // Best-effort restore
  }
}

function writeGapLog(content) {
  const dir = path.dirname(GAP_LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(GAP_LOG_PATH, content, 'utf8');
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('gap-log-injection: readSessionGapLog() via buildTaskPrompt()', () => {
  before(() => {
    backupGapLog();
  });

  after(() => {
    restoreGapLog();
  });

  it('injects gap log section when session-gap-log.jsonl contains entries', () => {
    // Write 2 sample gap entries to the canonical log path
    writeGapLog(SAMPLE_GAP_LINE_1 + '\n' + SAMPLE_GAP_LINE_2 + '\n');

    const entry = makeEntry();

    // generateSpawnInstruction calls buildTaskPrompt internally
    const instruction = generateSpawnInstruction(entry);

    assert.ok(typeof instruction === 'string', 'generateSpawnInstruction should return a string');
    assert.ok(
      instruction.includes('Router Gap Observations'),
      `Expected prompt to contain "Router Gap Observations". Got:\n${instruction}`
    );
    assert.ok(
      instruction.includes('artifact-integrator produced placeholder report'),
      'Expected first gap entry description to appear in prompt'
    );
    assert.ok(
      instruction.includes('6 skills missing from agent frontmatter after skill-creator run'),
      'Expected second gap entry description to appear in prompt'
    );
  });

  it('includes gap entries via generateSpawnRequest prompt field', () => {
    writeGapLog(SAMPLE_GAP_LINE_1 + '\n' + SAMPLE_GAP_LINE_2 + '\n');

    const entry = makeEntry();
    const request = generateSpawnRequest(entry);

    assert.ok(
      typeof request === 'object' && request !== null,
      'generateSpawnRequest should return an object'
    );
    assert.ok(typeof request.prompt === 'string', 'spawn request should have a prompt string');
    assert.ok(
      request.prompt.includes('Router Gap Observations'),
      `Expected spawn request prompt to contain "Router Gap Observations". Got:\n${request.prompt}`
    );
    assert.ok(
      request.prompt.includes('artifact-integrator produced placeholder report'),
      'Expected first gap description in spawn request prompt'
    );
    assert.ok(
      request.prompt.includes('6 skills missing from agent frontmatter after skill-creator run'),
      'Expected second gap description in spawn request prompt'
    );
  });

  it('omits gap section when session-gap-log.jsonl does not exist', () => {
    // Remove the file to simulate a fresh session with no gaps
    if (fs.existsSync(GAP_LOG_PATH)) {
      fs.unlinkSync(GAP_LOG_PATH);
    }

    const entry = makeEntry();
    const instruction = generateSpawnInstruction(entry);

    assert.ok(
      typeof instruction === 'string',
      'generateSpawnInstruction should still return a string when gap log absent'
    );
    assert.ok(
      !instruction.includes('Router Gap Observations'),
      'Expected no gap section when gap log file does not exist'
    );
  });

  it('omits gap section when session-gap-log.jsonl is empty', () => {
    writeGapLog('');

    const entry = makeEntry();
    const instruction = generateSpawnInstruction(entry);

    assert.ok(
      !instruction.includes('Router Gap Observations'),
      'Expected no gap section when gap log is empty'
    );
  });

  it('skips malformed lines and still emits valid entries', () => {
    const malformedLine = 'NOT VALID JSON {{{';
    writeGapLog(malformedLine + '\n' + SAMPLE_GAP_LINE_1 + '\n');

    const entry = makeEntry();
    const instruction = generateSpawnInstruction(entry);

    // Malformed line is skipped, valid entry still appears
    assert.ok(
      instruction.includes('artifact-integrator produced placeholder report'),
      'Expected valid gap entry to appear even when other lines are malformed'
    );
  });

  it('includes taskId and agent metadata in gap section', () => {
    writeGapLog(SAMPLE_GAP_LINE_1 + '\n');

    const entry = makeEntry();
    const instruction = generateSpawnInstruction(entry);

    assert.ok(instruction.includes('task-5'), 'Expected taskId to appear in gap section');
    assert.ok(
      instruction.includes('artifact-integrator'),
      'Expected agent name to appear in gap section'
    );
  });
});
