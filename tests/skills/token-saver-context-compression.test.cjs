#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const tokenSaver = require('../../.claude/skills/token-saver-context-compression/scripts/main.cjs');

test('classifyMemoryTarget applies deterministic mapping rules', () => {
  assert.equal(tokenSaver.classifyMemoryTarget('Gotcha: avoid this pitfall'), 'gotchas');
  assert.equal(tokenSaver.classifyMemoryTarget('Issue: bug in state machine'), 'issues');
  assert.equal(tokenSaver.classifyMemoryTarget('Decision: choose explicit transitions'), 'decisions');
  assert.equal(tokenSaver.classifyMemoryTarget('Use canonical taskupdate sequence'), 'patterns');
});

test('main blocks when evidence is insufficient and fail gate is enabled', () => {
  const result = tokenSaver.main(
    {
      query: 'task update flow',
      failOnInsufficientEvidence: true,
    },
    {
      runCommand: () => ({
        status: 0,
        stdout: '1. src/router.cjs (90.1%)\n- task update requirement',
        stderr: '',
      }),
      runTokenSaverWorkflow: () => ({
        ok: true,
        data: {
          evidence_sufficient: false,
          summary: 'insufficient',
        },
      }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'evidence_gate');
  assert.equal(result.evidenceSufficient, false);
});

test('main emits grouped memory records on successful workflow result', () => {
  const result = tokenSaver.main(
    {
      query: 'router quality',
      failOnInsufficientEvidence: true,
    },
    {
      runCommand: () => ({
        status: 0,
        stdout:
          '1. src/router.cjs (90.1%)\n- gotcha: duplicate phase advance\n2. src/task.cjs (84.0%)\n- decision: choose idempotency key',
        stderr: '',
      }),
      runTokenSaverWorkflow: () => ({
        ok: true,
        data: {
          evidence_sufficient: true,
          findings: [
            { text: 'Gotcha: duplicate phase advance can occur on retries' },
            { text: 'Decision: choose idempotency key for completion events' },
            { text: 'Issue: stale status propagation in router-state cache' },
            { text: 'Use canonical transition validation in one shared contract' },
          ],
        },
      }),
    }
  );

  assert.equal(result.ok, true);
  assert.ok(result.memoryRecords.gotchas.length > 0);
  assert.ok(result.memoryRecords.decisions.length > 0);
  assert.ok(result.memoryRecords.issues.length > 0);
  assert.ok(result.memoryRecords.patterns.length > 0);
});

test('main falls back to direct hybrid-search CLI when pnpm search fails', () => {
  const calls = [];
  const result = tokenSaver.main(
    {
      query: 'router flow',
      failOnInsufficientEvidence: true,
    },
    {
      runCommand: (cmd, args) => {
        calls.push([cmd, ...args]);
        if (cmd === 'pnpm') {
          return { status: 1, stdout: '', stderr: 'pnpm failed' };
        }
        return { status: 0, stdout: '1. src/router.cjs (88.2%)\n- routing flow', stderr: '' };
      },
      runTokenSaverWorkflow: () => ({
        ok: true,
        data: {
          evidence_sufficient: true,
          findings: [{ text: 'Decision: choose stable routing contract' }],
        },
      }),
    }
  );

  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'pnpm');
  assert.equal(calls[1][0], process.execPath);
});
