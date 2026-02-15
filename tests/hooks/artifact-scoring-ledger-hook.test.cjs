#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { processHookInput } = require('../../.claude/hooks/quality/artifact-scoring-ledger-hook.cjs');
const { getRuntimePaths, readJsonlSafe } = require('../../.claude/lib/quality/artifact-quality-runtime.cjs');

function mkProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-score-hook-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

test('writes score entry and opens remediation for low score', () => {
  const projectRoot = mkProjectRoot();
  const hookInput = {
    session_id: 'session-1',
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: 'task-1',
        status: 'completed',
        metadata: {
          artifactType: 'skill',
          artifactName: 'assimilate',
          overallScore: 0.55,
          scores: {
            completeness: 0.6,
            accuracy: 0.5,
            clarity: 0.6,
            consistency: 0.55,
            actionability: 0.5,
          },
        },
      },
    },
  };

  const result = processHookInput(hookInput, projectRoot);
  assert.equal(result.scored, true);
  assert.equal(result.remediated, true);

  const runtime = getRuntimePaths(projectRoot);
  const ledger = readJsonlSafe(runtime.ledgerPath);
  const remediation = readJsonlSafe(runtime.remediationPath);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].artifactType, 'skill');
  assert.equal(ledger[0].artifactName, 'assimilate');
  assert.equal(remediation.length, 1);
  assert.equal(remediation[0].action, 'open');
  assert.equal(remediation[0].status, 'open');
});

test('resolves open remediation when score recovers', () => {
  const projectRoot = mkProjectRoot();
  const low = {
    session_id: 'session-2',
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: 'task-2',
        status: 'completed',
        metadata: { artifactType: 'hook', artifactName: 'x-hook', overallScore: 0.5 },
      },
    },
  };
  const high = {
    session_id: 'session-2',
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: 'task-3',
        status: 'completed',
        metadata: { artifactType: 'hook', artifactName: 'x-hook', overallScore: 0.91 },
      },
    },
  };

  processHookInput(low, projectRoot);
  const result = processHookInput(high, projectRoot);
  assert.equal(result.scored, true);
  assert.equal(result.remediated, true);

  const runtime = getRuntimePaths(projectRoot);
  const remediation = readJsonlSafe(runtime.remediationPath);
  assert.equal(remediation.length, 2);
  assert.equal(remediation[1].action, 'resolve');
  assert.equal(remediation[1].status, 'resolved');
});
