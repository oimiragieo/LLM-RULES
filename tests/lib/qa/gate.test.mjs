import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { gate, evaluateGateContext } from '../../../.claude/lib/qa/gate.mjs';

test('evaluateGateContext fails when required checks do not pass', () => {
  const result = evaluateGateContext({
    mustPassChecks: ['lint', 'tests'],
    checks: { lint: true, tests: false },
  });
  assert.equal(result.passed, false);
  assert.ok(result.errors.some(e => e.includes('tests')));
});

test('gate passes when required checks and artifacts are present', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
  const artifactPath = path.join(projectRoot, 'report.md');
  fs.writeFileSync(artifactPath, '# report\n', 'utf8');
  try {
    const ok = await gate({
      projectRoot,
      mustPassChecks: ['lint'],
      checks: { lint: true },
      requiredArtifacts: ['report.md'],
    });
    assert.equal(ok, true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
