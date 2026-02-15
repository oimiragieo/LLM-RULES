#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const evalUpdater = require('../../.claude/skills/eval-harness-updater/scripts/main.cjs');

test('eval-harness-updater emits checklist for harness target', () => {
  const result = evalUpdater.main({
    harness: 'tests/evals/subagent-memory-rag-live.eval.cjs',
    trigger: 'manual',
  });

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.length > 0);
});

test('eval-harness-updater fails without target', () => {
  const result = evalUpdater.main({});
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'input');
});
