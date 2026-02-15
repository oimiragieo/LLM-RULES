#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const preHook = path.resolve('.claude/skills/skill-updater/hooks/pre-execute.cjs');
const postHook = path.resolve('.claude/skills/skill-updater/hooks/post-execute.cjs');

test('pre-execute validates skill and trigger', () => {
  const ok = spawnSync(
    process.execPath,
    [preHook, JSON.stringify({ skill: 'tdd', trigger: 'reflection' })],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(ok.status, 0);
  const parsed = JSON.parse(ok.stdout || '{}');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode === 'refresh' || parsed.mode === 'create', true);

  const bad = spawnSync(
    process.execPath,
    [preHook, JSON.stringify({ skill: 'tdd', trigger: 'bad-trigger' })],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(bad.status, 1);
});

test('post-execute emits compact summary', () => {
  const proc = spawnSync(
    process.execPath,
    [
      postHook,
      JSON.stringify({ ok: true, mode: 'plan', trigger: 'evolve', target: { skillName: 'tdd' } }),
    ],
    { encoding: 'utf8' }
  );

  assert.equal(proc.status, 0);
  const parsed = JSON.parse(proc.stdout || '{}');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, 'plan');
  assert.equal(parsed.trigger, 'evolve');
  assert.equal(parsed.target, 'tdd');
});
