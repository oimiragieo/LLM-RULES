#!/usr/bin/env node
/**
 * Integration tests: agent gap extraction via post-completion-chain.cjs
 *
 * Verifies that processTaskCompletion() extracts the gapLog array from
 * TaskUpdate metadata and appends each entry to session-gap-log.jsonl
 * via appendAgentGapsToSessionLog() (tested indirectly).
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
  `gap-log-extraction-test-${crypto.randomBytes(6).toString('hex')}.jsonl`
);

// Set the override BEFORE requiring the module so appendAgentGapsToSessionLog() uses it
process.env.GAP_LOG_PATH_OVERRIDE = GAP_LOG_PATH;

// Module under test — exports processTaskCompletion
const {
  processTaskCompletion,
} = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal hook payload that simulates a PostToolUse event for TaskUpdate.
 * processTaskCompletion() reads tool_name and tool_input from the hookData object.
 */
function makeHookPayload(taskId, metadata = {}) {
  return {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId,
      status: 'completed',
      metadata,
    },
  };
}

/** Read the current gap log and parse all JSON lines */
function readGapLog() {
  if (!fs.existsSync(GAP_LOG_PATH)) return [];
  const raw = fs.readFileSync(GAP_LOG_PATH, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_e) {
        return null;
      }
    })
    .filter(Boolean);
}

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

function clearGapLog() {
  try {
    if (fs.existsSync(GAP_LOG_PATH)) {
      fs.unlinkSync(GAP_LOG_PATH);
    }
  } catch (_e) {
    // ignore
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('agent-gap-extraction: appendAgentGapsToSessionLog via processTaskCompletion()', () => {
  before(() => {
    backupGapLog();
  });

  after(() => {
    restoreGapLog();
  });

  beforeEach(() => {
    // Start each test with a clean gap log so assertions are unambiguous
    clearGapLog();
  });

  it('appends gap entry to session-gap-log.jsonl when metadata.gapLog is present', async () => {
    const gaps = [
      {
        type: 'retry',
        description: 'agent stalled on Phase 2',
        agent: 'evolution-orchestrator',
        context: 'skill creation incomplete',
      },
    ];

    const payload = makeHookPayload('task-7', { gapLog: gaps });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    assert.ok(entries.length >= 1, `Expected at least 1 gap entry, got ${entries.length}`);

    const entry = entries.find(e => e.description === 'agent stalled on Phase 2');
    assert.ok(entry, 'Expected gap entry with matching description');
    assert.strictEqual(entry.source, 'agent_metadata', 'Entry source should be "agent_metadata"');
    assert.strictEqual(entry.taskId, 'task-7', 'Entry taskId should match the task');
    assert.strictEqual(entry.type, 'retry', 'Entry type should be preserved from gap');
  });

  it('sets source to "agent_metadata" on all appended entries', async () => {
    const gaps = [
      { type: 'integration_gap', description: 'missing catalog entry', agent: 'developer' },
      { type: 'retry', description: 'placeholder output produced', agent: 'qa' },
    ];

    const payload = makeHookPayload('task-22', { gapLog: gaps });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const inserted = entries.filter(e => e.taskId === 'task-22');
    assert.strictEqual(
      inserted.length,
      2,
      `Expected 2 entries for task-22, got ${inserted.length}`
    );

    for (const e of inserted) {
      assert.strictEqual(
        e.source,
        'agent_metadata',
        `Every inserted entry must have source "agent_metadata". Got: ${e.source}`
      );
    }
  });

  it('preserves agent, description, and type fields on the written entry', async () => {
    const gaps = [
      {
        type: 'integration_gap',
        description: '6 skills missing from agent frontmatter after skill-creator run',
        agent: 'developer',
        context: 'developer.md, devops.md, qa.md affected',
      },
    ];

    const payload = makeHookPayload('task-11', { gapLog: gaps });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const entry = entries.find(e => e.taskId === 'task-11');

    assert.ok(entry, 'Expected entry with taskId task-11');
    assert.strictEqual(entry.agent, 'developer', 'agent field should be preserved');
    assert.strictEqual(
      entry.description,
      '6 skills missing from agent frontmatter after skill-creator run',
      'description should match'
    );
    assert.strictEqual(entry.type, 'integration_gap', 'type should be preserved');
    assert.strictEqual(
      entry.context,
      'developer.md, devops.md, qa.md affected',
      'context should be preserved'
    );
  });

  it('writes a valid JSON line per entry (file is parseable JSONL)', async () => {
    const gaps = [
      { type: 'retry', description: 'first gap', agent: 'planner' },
      { type: 'stall', description: 'second gap', agent: 'architect' },
    ];

    const payload = makeHookPayload('task-30', { gapLog: gaps });
    await processTaskCompletion(payload);

    assert.ok(fs.existsSync(GAP_LOG_PATH), 'Gap log file should exist after write');

    const raw = fs.readFileSync(GAP_LOG_PATH, 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    assert.ok(lines.length >= 2, `Expected at least 2 lines, got ${lines.length}`);

    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        assert.fail(`Gap log line is not valid JSON: "${line}" — ${e.message}`);
      }
      assert.ok(parsed && typeof parsed === 'object', 'Each line should parse to an object');
    }
  });

  it('does not append anything when metadata.gapLog is absent', async () => {
    const payload = makeHookPayload('task-99', { summary: 'no gaps here' });
    await processTaskCompletion(payload);

    // Gap log should not have been created or modified with an entry for task-99
    const entries = readGapLog();
    const forTask = entries.filter(e => e.taskId === 'task-99');
    assert.strictEqual(
      forTask.length,
      0,
      'Expected no gap entries when gapLog is absent from metadata'
    );
  });

  it('does not append anything when metadata.gapLog is an empty array', async () => {
    const payload = makeHookPayload('task-100', { gapLog: [] });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const forTask = entries.filter(e => e.taskId === 'task-100');
    assert.strictEqual(forTask.length, 0, 'Expected no gap entries when gapLog is an empty array');
  });

  it('skips entries that lack a description field', async () => {
    const gaps = [
      { type: 'retry', agent: 'developer' }, // no description — should be skipped
      { type: 'stall', description: 'valid gap', agent: 'qa' }, // valid
    ];

    const payload = makeHookPayload('task-45', { gapLog: gaps });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const forTask = entries.filter(e => e.taskId === 'task-45');

    // Only the valid entry (with description) should have been written
    assert.strictEqual(
      forTask.length,
      1,
      `Expected exactly 1 valid gap entry (skipping no-description), got ${forTask.length}`
    );
    assert.strictEqual(forTask[0].description, 'valid gap');
  });

  it('does not throw when task status is not "completed"', async () => {
    const gaps = [{ type: 'retry', description: 'some gap', agent: 'developer' }];
    const payload = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-55',
        status: 'in_progress', // not completed — appendAgentGapsToSessionLog should NOT be called
        metadata: { gapLog: gaps },
      },
    };

    // Should not throw and should not write any gaps
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const forTask = entries.filter(e => e.taskId === 'task-55');
    assert.strictEqual(
      forTask.length,
      0,
      'Expected no gap entries when task status is in_progress'
    );
  });

  it('includes an ISO 8601 timestamp on each written entry', async () => {
    const gaps = [{ type: 'retry', description: 'timestamped gap', agent: 'planner' }];
    const payload = makeHookPayload('task-60', { gapLog: gaps });
    await processTaskCompletion(payload);

    const entries = readGapLog();
    const entry = entries.find(e => e.taskId === 'task-60');

    assert.ok(entry, 'Expected entry for task-60');
    assert.ok(
      typeof entry.timestamp === 'string' && entry.timestamp.length > 0,
      'Entry should have a non-empty timestamp string'
    );
    // Validate ISO 8601 format (at minimum parseable by Date)
    const ts = Date.parse(entry.timestamp);
    assert.ok(Number.isFinite(ts), `Timestamp "${entry.timestamp}" should be a valid ISO date`);
  });
});
