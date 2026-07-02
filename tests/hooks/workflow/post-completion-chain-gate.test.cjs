'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  applyGateResultToPhase,
  buildPhaseGateRecord,
} = require('../../../.claude/hooks/workflow/post-completion-chain.cjs');

describe('post-completion-chain gate records', () => {
  it('preserves missing implementation plan artifact as a blocking gate failure', () => {
    const record = buildPhaseGateRecord(
      {
        passed: false,
        blocking: ['Implementation plan artifact path not specified'],
        warnings: [],
      },
      new Date('2026-07-02T12:00:00.000Z')
    );

    assert.equal(record.passed, false);
    assert.deepEqual(record.blocking, ['Implementation plan artifact path not specified']);
    assert.deepEqual(record.warnings, []);
    assert.equal(record.evaluatedAt, '2026-07-02T12:00:00.000Z');
  });

  it('marks a phase blocked when its gate fails', () => {
    const phaseData = { status: 'in_progress' };

    applyGateResultToPhase(
      phaseData,
      {
        passed: false,
        blocking: ['Missing required artifact'],
        warnings: ['Optional signal absent'],
      },
      new Date('2026-07-02T12:05:00.000Z')
    );

    assert.equal(phaseData.status, 'blocked');
    assert.equal(phaseData.gate.passed, false);
    assert.deepEqual(phaseData.gate.blocking, ['Missing required artifact']);
  });
});
