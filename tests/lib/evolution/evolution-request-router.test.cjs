#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const router = require('../../../.claude/lib/evolution/evolution-request-router.cjs');

test('stale_skill request is prioritized and routed to skill-updater', () => {
  const plan = router.buildDispatchPlan([
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
  ]);

  assert.equal(plan.actions.length, 2);
  assert.equal(plan.actions[0].executorSkill, 'skill-updater');
  assert.equal(plan.actions[0].trigger, 'stale_skill');
  assert.match(plan.actions[0].args, /--skill tdd/);
});

test('generateAndPersistDispatchPlan reads queue and writes runtime plan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-router-'));
  const queuePath = path.join(root, 'evolution-requests.jsonl');
  const outputPath = path.join(root, 'evolution-dispatch-plan.json');

  try {
    fs.writeFileSync(
      queuePath,
      `${JSON.stringify({
        id: 'req_1',
        timestamp: '2026-02-19T00:00:00.000Z',
        source: 'reflection-agent',
        trigger: 'stale_skill',
        suggestedArtifactType: 'skill',
        targetArtifact: { type: 'skill', name: 'tdd' },
        summary: 'refresh',
        evidence: 'stale',
        status: 'proposed',
      })}\n`,
      'utf8'
    );

    const plan = router.generateAndPersistDispatchPlan({ queuePath, outputPath });
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].executorSkill, 'skill-updater');
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
