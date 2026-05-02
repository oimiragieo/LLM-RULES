#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'hooks',
  'workflow',
  'post-creation-integration.cjs'
);
const {
  isCreatorCompletion,
  processCreatorCompletion,
  appendToQueueWithImpact,
  MAX_QUEUE_ENTRY_BYTES,
} = require(HOOK_PATH);
const { INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH, validateIntegrationQueueEntry } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'workflow', 'integration-queue-contract.cjs')
);

const QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'integration-queue.jsonl'
);

test('isCreatorCompletion detects skill-creator metadata', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          creatorType: 'skill',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.creatorType, 'skill');
});

test('isCreatorCompletion detects skill creation via subject pattern', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          subject: 'Create new skill for ripgrep',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, true);
  assert.strictEqual(result.creatorType, 'skill');
});

test('isCreatorCompletion returns false for non-completed status', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'in_progress',
        metadata: {
          creatorType: 'skill',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

test('isCreatorCompletion returns false for non-creator tasks', () => {
  const input = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        metadata: {
          subject: 'Fix bug in authentication',
        },
      },
    },
  };

  const result = isCreatorCompletion(input);
  assert.strictEqual(result.match, false);
});

test('processCreatorCompletion writes to queue when gaps found', async () => {
  // Clean up queue
  if (fs.existsSync(QUEUE_PATH)) {
    fs.unlinkSync(QUEUE_PATH);
  }

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        taskId: '7',
        metadata: {
          creatorType: 'skill',
          artifactId: 'skill:test-skill',
        },
      },
    },
  };

  await processCreatorCompletion(hookData);

  // Verify queue file was created
  assert.ok(fs.existsSync(QUEUE_PATH));

  // Verify entry was written
  const content = fs.readFileSync(QUEUE_PATH, 'utf8');
  const lines = content.trim().split('\n');
  assert.ok(lines.length > 0);

  const entry = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(entry.artifactId, 'skill:test-skill');
  assert.strictEqual(entry.creatorType, 'skill');
  assert.strictEqual(entry.processed, false);

  // Cleanup
  fs.unlinkSync(QUEUE_PATH);
});

test('processCreatorCompletion skips queue write when artifactId is unknown:unknown', async () => {
  // Clean up queue
  if (fs.existsSync(QUEUE_PATH)) {
    fs.unlinkSync(QUEUE_PATH);
  }

  // Simulate a creator pattern match but no artifact metadata (generates unknown:unknown)
  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        status: 'completed',
        taskId: '99',
        metadata: {
          // creatorType not set — will be detected via subject pattern as 'unknown'
          // No artifactId or artifactName — extractArtifactId returns 'unknown:unknown'
          summary: 'skill-creator completed some work',
        },
      },
    },
  };

  const result = await processCreatorCompletion(hookData);

  // Queue should NOT have been written
  const queueExists = fs.existsSync(QUEUE_PATH);
  if (queueExists) {
    const content = fs.readFileSync(QUEUE_PATH, 'utf8').trim();
    assert.strictEqual(
      content,
      '',
      'Queue should be empty — unknown:unknown entries must not be written'
    );
  }

  // Hook should still allow (fail-open)
  assert.ok(result.result.allow, 'Hook must allow (fail-open) even when skipping queue write');
});

test('appendToQueueWithImpact caps oversized queue entries to 10KB', () => {
  if (fs.existsSync(QUEUE_PATH)) fs.unlinkSync(QUEUE_PATH);

  const hugeImpactReport = {
    mustHave: Array.from({ length: 300 }, (_v, i) => ({
      id: `must-${i}`,
      status: 'pending',
      description: 'x'.repeat(120),
    })),
    shouldHave: Array.from({ length: 300 }, (_v, i) => ({
      id: `should-${i}`,
      status: 'pending',
      description: 'y'.repeat(120),
    })),
    notes: 'z'.repeat(40000),
  };

  appendToQueueWithImpact('skill:oversize-test', 'skill', ['missing-link'], hugeImpactReport);

  const lines = fs.readFileSync(QUEUE_PATH, 'utf8').split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1];
  const lineBytes = Buffer.byteLength(lastLine, 'utf8');

  assert.ok(
    lineBytes <= MAX_QUEUE_ENTRY_BYTES,
    `Queue line exceeded ${MAX_QUEUE_ENTRY_BYTES} bytes: ${lineBytes}`
  );

  const parsed = JSON.parse(lastLine);
  assert.ok(
    parsed.impactReportTruncated === true ||
      parsed.impactReportOmitted === true ||
      parsed.impactReportSanitized === true,
    'Expected oversized impact report to be sanitized/truncated/omitted'
  );

  fs.unlinkSync(QUEUE_PATH);
});

test('appendToQueueWithImpact sanitizes invalid impactReport shape', () => {
  if (fs.existsSync(QUEUE_PATH)) fs.unlinkSync(QUEUE_PATH);

  // Invalid shape: scalar instead of object
  appendToQueueWithImpact('skill:invalid-shape', 'skill', ['missing-link'], 'not-an-object');

  const lines = fs.readFileSync(QUEUE_PATH, 'utf8').split('\n').filter(Boolean);
  const parsed = JSON.parse(lines[lines.length - 1]);

  assert.equal(parsed.impactReport, null);
  assert.equal(parsed.impactReportInvalid, true);

  fs.unlinkSync(QUEUE_PATH);
});

test('integration queue entries validate against the queue schema', () => {
  assert.ok(fs.existsSync(INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH));

  const entry = {
    timestamp: new Date().toISOString(),
    artifactId: 'skill:schema-valid',
    creatorType: 'skill',
    changeType: 'created',
    source: 'post-creation-integration.cjs',
    gaps: ['catalog'],
    priority: 'P1',
    processed: false,
    impactReport: null,
  };

  const result = validateIntegrationQueueEntry(entry);
  assert.deepStrictEqual(result.errors, null);
});

test('validateIntegrationQueueEntry rejects malformed entries (ambiguous shape)', () => {
  const bad = {
    timestamp: new Date().toISOString(),
    source: 'test',
    processed: false,
    artifactId: 'skill:x',
    creatorType: 'skill',
    changeType: 'created',
    gaps: ['a'],
    priority: 'P1',
    artifactPath: 'should-not-coexist',
    artifactType: 'skill',
    missingIntegration: 'x',
    detail: 'y',
  };
  const result = validateIntegrationQueueEntry(bad);
  assert.strictEqual(result.valid, false);
  const joined = (result.errors || []).map(e => String(e.message || '')).join(' | ');
  assert.ok(
    joined.includes('exactly one integration queue shape') ||
      /oneof|must match exactly one|not.*oneof/i.test(joined),
    `expected schema/shape rejection, got: ${joined}`
  );
});

test('validateIntegrationQueueEntry rejects entries with unknown creatorType', () => {
  const bad = {
    timestamp: new Date().toISOString(),
    source: 'test',
    processed: false,
    artifactId: 'skill:x',
    creatorType: 'not-a-real-type',
    changeType: 'created',
    gaps: ['a'],
    priority: 'P1',
  };
  const result = validateIntegrationQueueEntry(bad);
  assert.strictEqual(result.valid, false);
});

test('appendToQueueWithImpact rejects malformed entries before writing JSONL', () => {
  if (fs.existsSync(QUEUE_PATH)) fs.unlinkSync(QUEUE_PATH);

  const result = appendToQueueWithImpact('', 'skill', ['missing-link'], null);

  assert.equal(result, false);
  assert.equal(fs.existsSync(QUEUE_PATH), false);
});
