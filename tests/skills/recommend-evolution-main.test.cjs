#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const recommend = require('../../.claude/skills/recommend-evolution/scripts/main.cjs');
const preHook = require('../../.claude/skills/recommend-evolution/hooks/pre-execute.cjs');

test('recommend-evolution buildRequest accepts stale_skill trigger', () => {
  const built = recommend.buildRequest({
    trigger: 'stale_skill',
    evidence: 'skill tdd is stale',
    summary: 'refresh tdd',
    suggestedArtifactType: 'skill',
  });
  assert.equal(built.ok, true);
  assert.equal(built.request.trigger, 'stale_skill');
});

test('recommend-evolution pre-execute rejects stale_skill without evidence', () => {
  const result = preHook.main({ trigger: 'stale_skill' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(err => err.includes('evidence')));
});

test('recommend-evolution appendQueueEntry writes JSONL line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recommend-evolution-'));
  const queuePath = path.join(root, 'evolution-requests.jsonl');
  try {
    const built = recommend.buildRequest({
      trigger: 'user_request',
      evidence: 'explicit ask',
      summary: 'create capability',
      suggestedArtifactType: 'skill',
    });
    assert.equal(built.ok, true);
    recommend.appendQueueEntry(built.request, queuePath);
    const lines = fs.readFileSync(queuePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.trigger, 'user_request');
    assert.equal(parsed.status, 'proposed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
