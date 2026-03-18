'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

let checkReadiness;
try {
  ({ checkReadiness } = require('../../.claude/lib/utils/readiness-checker.cjs'));
} catch {
  checkReadiness = null;
}

describe('readiness-checker', () => {
  it('exports checkReadiness function', () => {
    assert.strictEqual(typeof checkReadiness, 'function');
  });

  it('returns { ready, gates } structure', () => {
    const context = {
      hasRequirements: true,
      hasTechnicalDesign: true,
      hasDependenciesResolved: true,
      hasTestStrategy: true,
      hasAcceptanceCriteria: true,
    };
    const result = checkReadiness(context);
    assert.strictEqual(typeof result.ready, 'boolean');
    assert.ok(Array.isArray(result.gates));
  });

  it('returns 5 gates', () => {
    const context = {};
    const result = checkReadiness(context);
    assert.strictEqual(result.gates.length, 5);
  });

  it('each gate has name, passed, reason', () => {
    const result = checkReadiness({});
    result.gates.forEach(gate => {
      assert.ok(typeof gate.name === 'string' && gate.name.length > 0);
      assert.ok(typeof gate.passed === 'boolean');
      assert.ok(typeof gate.reason === 'string');
    });
  });

  it('ready is true when all 5 conditions pass', () => {
    const context = {
      hasRequirements: true,
      hasTechnicalDesign: true,
      hasDependenciesResolved: true,
      hasTestStrategy: true,
      hasAcceptanceCriteria: true,
    };
    const result = checkReadiness(context);
    assert.strictEqual(result.ready, true);
    result.gates.forEach(g => assert.strictEqual(g.passed, true));
  });

  it('ready is false when any condition fails', () => {
    const context = {
      hasRequirements: true,
      hasTechnicalDesign: false,
      hasDependenciesResolved: true,
      hasTestStrategy: true,
      hasAcceptanceCriteria: true,
    };
    const result = checkReadiness(context);
    assert.strictEqual(result.ready, false);
    const failed = result.gates.filter(g => !g.passed);
    assert.ok(failed.length >= 1);
  });

  it('ready is false when context is empty object', () => {
    const result = checkReadiness({});
    assert.strictEqual(result.ready, false);
  });

  it('gate names match the 5 readiness conditions', () => {
    const { GATE_NAMES } = require('../../.claude/lib/utils/readiness-checker.cjs');
    assert.strictEqual(GATE_NAMES.length, 5);
    GATE_NAMES.forEach(name => assert.strictEqual(typeof name, 'string'));
  });

  it('provides a reason for each failing gate', () => {
    const result = checkReadiness({});
    result.gates
      .filter(g => !g.passed)
      .forEach(g => {
        assert.ok(g.reason.length > 0, `Gate "${g.name}" missing reason`);
      });
  });
});
