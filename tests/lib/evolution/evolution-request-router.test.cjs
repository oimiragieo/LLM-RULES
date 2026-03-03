#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createTempProjectRuntime,
  cleanupTempRoot,
  writeJsonl,
} = require('../../support/runtime-fixtures.cjs');

const router = require('../../../.claude/lib/evolution/evolution-request-router.cjs');

test('stale_skill request is prioritized and routed to skill-updater', () => {
  const plan = router.buildDispatchPlan(
    [
      {
        id: 'b',
        timestamp: '2026-02-20T00:00:00.000Z',
        trigger: 'user_request',
        suggestedArtifactType: 'skill',
        summary: 'some request',
        evidence: 'some evidence',
        status: 'proposed',
      },
      {
        id: 'a',
        timestamp: '2026-02-21T00:00:00.000Z',
        trigger: 'stale_skill',
        suggestedArtifactType: 'skill',
        targetArtifact: { type: 'skill', name: 'tdd' },
        summary: 'refresh skill tdd',
        evidence: 'stale',
        status: 'proposed',
      },
    ],
    { requireEvalGate: false }
  );

  assert.equal(plan.actions.length, 2);
  assert.equal(plan.actions[0].executorSkill, 'skill-updater');
  assert.equal(plan.actions[0].trigger, 'stale_skill');
  assert.match(plan.actions[0].args, /--skill tdd/);
});

test('generateAndPersistDispatchPlan reads queue and writes runtime plan', () => {
  const { root } = createTempProjectRuntime('evolution-router-');
  const queuePath = path.join(root, 'evolution-requests.jsonl');
  const outputPath = path.join(root, 'evolution-dispatch-plan.json');

  try {
    writeJsonl(queuePath, {
      id: 'req_1',
      timestamp: '2026-02-19T00:00:00.000Z',
      source: 'reflection-agent',
      trigger: 'stale_skill',
      suggestedArtifactType: 'skill',
      targetArtifact: { type: 'skill', name: 'tdd' },
      summary: 'refresh',
      evidence: 'stale',
      status: 'proposed',
    });

    const plan = router.generateAndPersistDispatchPlan({
      queuePath,
      outputPath,
      ttlHours: 720,
      nowMs: Date.parse('2026-03-02T12:00:00.000Z'),
    });
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].executorSkill, 'skill-updater');
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    cleanupTempRoot(root);
  }
});

test('applyQueueGovernance expires stale proposed requests to dead-letter', () => {
  const nowMs = Date.parse('2026-03-02T12:00:00.000Z');
  const governed = router.applyQueueGovernance(
    [
      {
        id: 'old',
        timestamp: '2026-02-28T00:00:00.000Z',
        trigger: 'stale_skill',
        status: 'proposed',
      },
      {
        id: 'fresh',
        timestamp: '2026-03-02T11:30:00.000Z',
        trigger: 'stale_skill',
        status: 'proposed',
      },
    ],
    { ttlHours: 24, nowMs }
  );

  assert.equal(governed.activeRequests.length, 1);
  assert.equal(governed.activeRequests[0].id, 'fresh');
  assert.equal(governed.deadLetters.length, 1);
  assert.equal(governed.deadLetters[0].id, 'old');
  assert.equal(governed.deadLetters[0].deadLetterReason, 'ttl_expired');
});

test('generateAndPersistDispatchPlan writes dead-letter entries and rewrites queue', () => {
  const { root } = createTempProjectRuntime('evolution-router-dlq-');
  const queuePath = path.join(root, 'evolution-requests.jsonl');
  const outputPath = path.join(root, 'evolution-dispatch-plan.json');
  const deadLetterPath = path.join(root, 'evolution-requests-dead-letter.jsonl');

  try {
    writeJsonl(queuePath, [
      {
        id: 'expired',
        timestamp: '2026-02-19T00:00:00.000Z',
        source: 'reflection-agent',
        trigger: 'stale_skill',
        suggestedArtifactType: 'skill',
        targetArtifact: { type: 'skill', name: 'legacy' },
        summary: 'old request',
        evidence: 'stale',
        status: 'proposed',
      },
      {
        id: 'fresh',
        timestamp: '2026-03-02T00:00:00.000Z',
        source: 'reflection-agent',
        trigger: 'stale_skill',
        suggestedArtifactType: 'skill',
        targetArtifact: { type: 'skill', name: 'tdd' },
        summary: 'fresh request',
        evidence: 'stale',
        status: 'proposed',
      },
    ]);

    const plan = router.generateAndPersistDispatchPlan({
      queuePath,
      outputPath,
      deadLetterPath,
      ttlHours: 24,
      nowMs: Date.parse('2026-03-02T12:00:00.000Z'),
    });

    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].requestId, 'fresh');
    assert.equal(fs.existsSync(deadLetterPath), true);

    const dlqLines = fs
      .readFileSync(deadLetterPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    assert.equal(dlqLines.length, 1);
    assert.equal(dlqLines[0].id, 'expired');
    assert.equal(dlqLines[0].deadLetterReason, 'ttl_expired');

    const remaining = fs
      .readFileSync(queuePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, 'fresh');
  } finally {
    cleanupTempRoot(root);
  }
});

test('buildDispatchPlan gates non-stale proposals without passing eval', () => {
  const plan = router.buildDispatchPlan(
    [
      {
        id: 'no-eval',
        timestamp: '2026-03-02T10:00:00.000Z',
        trigger: 'user_request',
        suggestedArtifactType: 'skill',
        summary: 'needs eval first',
        status: 'proposed',
      },
      {
        id: 'with-eval',
        timestamp: '2026-03-02T11:00:00.000Z',
        trigger: 'user_request',
        suggestedArtifactType: 'skill',
        summary: 'has eval',
        eval: { passed: true, deltaScore: 0.2 },
        status: 'proposed',
      },
      {
        id: 'stale-exempt',
        timestamp: '2026-03-02T09:00:00.000Z',
        trigger: 'stale_skill',
        suggestedArtifactType: 'skill',
        targetArtifact: { type: 'skill', name: 'tdd' },
        status: 'proposed',
      },
    ],
    { requireEvalGate: true }
  );

  assert.equal(plan.totalPending, 3);
  assert.equal(plan.gatedCount, 1);
  assert.equal(plan.gatedRequestIds.includes('no-eval'), true);
  assert.equal(plan.actions.length, 2);
});
