#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = require('../../.claude/hooks/reflection/unified-reflection-handler.cjs');

function mkTempRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-evolution-'));
  const runtime = path.join(root, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  return { root, runtime };
}

test('ingestStaleArtifactRecommendations creates stale_skill evolution requests once per timestamp', () => {
  const { root, runtime } = mkTempRuntime();
  const stalePath = path.join(runtime, 'stale-artifacts.json');
  const queuePath = path.join(runtime, 'evolution-requests.jsonl');
  const statePath = path.join(runtime, 'stale-artifacts-consumed.json');

  try {
    fs.writeFileSync(
      stalePath,
      JSON.stringify(
        {
          timestamp: '2026-02-19T00:00:00.000Z',
          stale: [{ type: 'skill', name: 'tdd', status: 'stale' }],
          unverified: [{ type: 'agent', name: 'reflection-agent', status: 'unverified' }],
        },
        null,
        2
      ),
      'utf8'
    );

    const first = hook.ingestStaleArtifactRecommendations({
      projectRoot: root,
      staleArtifactsPath: stalePath,
      queuePath,
      statePath,
    });
    assert.equal(first.created, 2);

    const second = hook.ingestStaleArtifactRecommendations({
      projectRoot: root,
      staleArtifactsPath: stalePath,
      queuePath,
      statePath,
    });
    assert.equal(second.created, 0);

    const lines = fs.readFileSync(queuePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    const parsed = lines.map(line => JSON.parse(line));
    assert.ok(parsed.every(entry => entry.trigger === 'stale_skill'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
