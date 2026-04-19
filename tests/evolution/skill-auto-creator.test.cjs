'use strict';

// F7 ARCHIVED — skill-auto-creator.cjs replaced with a disabled stub.
// Full test suite moved to tests/evolution/_archive/skill-auto-creator.test.cjs
// This file only validates the stub contract.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const stub = require('../../.claude/lib/evolution/skill-auto-creator.cjs');

describe('skill-auto-creator stub contract (F7 archived)', () => {
  it('exports disabled: true', () => {
    assert.equal(stub.disabled, true);
  });

  it('exports reason: GATE4_VIOLATION', () => {
    assert.equal(stub.reason, 'GATE4_VIOLATION');
  });

  it('exports archivedAt as a non-empty string', () => {
    assert.ok(typeof stub.archivedAt === 'string' && stub.archivedAt.length > 0);
  });
});
