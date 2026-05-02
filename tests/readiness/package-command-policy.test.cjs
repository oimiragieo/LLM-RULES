'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ReadinessScorer,
  DEFAULT_RUN_PACKAGE_COMMANDS,
} = require('../../.claude/lib/readiness/readiness-scorer.cjs');
const {
  getPackageCommandSkipReason,
} = require('../../.claude/lib/readiness/package-command-policy.cjs');

describe('readiness package command policy', () => {
  it('skips package-manager commands by default', () => {
    assert.strictEqual(DEFAULT_RUN_PACKAGE_COMMANDS, false);

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-package-skip-'));
    try {
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ scripts: { build: 'node -e "setTimeout(function(){}, 60000)"' } })
      );

      assert.strictEqual(
        getPackageCommandSkipReason('pnpm build', projectDir, false),
        'package command execution disabled'
      );
      assert.strictEqual(
        getPackageCommandSkipReason('pnpm test', projectDir, true),
        'package script "test" not found'
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('scores an empty temp repository without invoking package scripts', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-fast-score-'));
    try {
      const scorer = new ReadinessScorer({
        repoPath: projectDir,
        timeout: 5000,
      });

      const start = Date.now();
      const report = scorer.score();
      const elapsedMs = Date.now() - start;

      assert.ok(report, 'Should produce a readiness report');
      assert.ok(elapsedMs < 2500, `Expected fast static scoring, took ${elapsedMs}ms`);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
