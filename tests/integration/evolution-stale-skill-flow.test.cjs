#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const reflectionHook = require('../../.claude/hooks/reflection/unified-reflection-handler.cjs');
const router = require('../../.claude/lib/evolution/evolution-request-router.cjs');

test('stale artifacts -> evolution requests -> dispatch plan routes to skill-updater', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-stale-flow-'));
  const runtimeDir = path.join(root, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const stalePath = path.join(runtimeDir, 'stale-artifacts.json');
  const queuePath = path.join(runtimeDir, 'evolution-requests.jsonl');
  const statePath = path.join(runtimeDir, 'stale-artifacts-consumed.json');
  const dispatchPath = path.join(runtimeDir, 'evolution-dispatch-plan.json');

  try {
    fs.writeFileSync(
      stalePath,
      JSON.stringify(
        {
          timestamp: '2026-02-19T08:00:00.000Z',
          stale: [{ type: 'skill', name: 'tdd', status: 'stale' }],
          unverified: [],
        },
        null,
        2
      ),
      'utf8'
    );

    const ingest = reflectionHook.ingestStaleArtifactRecommendations({
      projectRoot: root,
      staleArtifactsPath: stalePath,
      queuePath,
      statePath,
    });
    assert.equal(ingest.created, 1);

    const plan = router.generateAndPersistDispatchPlan({
      queuePath,
      outputPath: dispatchPath,
    });
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].executorSkill, 'skill-updater');
    assert.equal(plan.actions[0].trigger, 'stale_skill');
    assert.match(plan.actions[0].args, /--skill tdd/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
