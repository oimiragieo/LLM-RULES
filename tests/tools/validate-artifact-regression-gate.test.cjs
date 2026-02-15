#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { appendJsonl } = require('../../.claude/lib/utils/jsonl-utils.cjs');
const { runGate } = require('../../.claude/tools/cli/validate-artifact-regression-gate.cjs');

function withProjectRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-regression-gate-'));
  const runtime = path.join(root, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const prev = process.cwd();
  process.chdir(root);
  try {
    return fn({ root, runtime });
  } finally {
    process.chdir(prev);
  }
}

test('fails when latest score drops below pass threshold', () =>
  withProjectRoot(({ runtime }) => {
    const ledger = path.join(runtime, 'artifact-score-ledger.jsonl');
    appendJsonl(ledger, {
      timestamp: new Date().toISOString(),
      artifactType: 'skill',
      artifactName: 'assimilate',
      source: 'test',
      overallScore: 0.8,
    });
    appendJsonl(ledger, {
      timestamp: new Date().toISOString(),
      artifactType: 'skill',
      artifactName: 'assimilate',
      source: 'test',
      overallScore: 0.6,
    });

    const result = runGate({
      projectRoot: process.cwd(),
      passThreshold: 0.7,
      maxRegression: 0.08,
      enforceRemediation: false,
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(' | '), /latest score/);
  }));

test('fails when open critical remediation exists', () =>
  withProjectRoot(({ runtime }) => {
    const ledger = path.join(runtime, 'artifact-score-ledger.jsonl');
    const remediation = path.join(runtime, 'remediation-queue.jsonl');
    appendJsonl(ledger, {
      timestamp: new Date().toISOString(),
      artifactType: 'hook',
      artifactName: 'artifact-scoring-ledger-hook',
      source: 'test',
      overallScore: 0.9,
    });
    appendJsonl(remediation, {
      timestamp: new Date().toISOString(),
      action: 'open',
      status: 'open',
      artifactKey: 'hook:artifact-scoring-ledger-hook',
      artifactType: 'hook',
      artifactName: 'artifact-scoring-ledger-hook',
      severity: 'critical',
      source: 'test',
    });

    const result = runGate({
      projectRoot: process.cwd(),
      passThreshold: 0.7,
      maxRegression: 0.08,
      enforceRemediation: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(' | '), /open remediation/);
  }));
