#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  validateRoutingConsistency,
} = require('../../../.claude/scripts/validate-routing-consistency.cjs');

describe('validate-routing-consistency', () => {
  it('should report no conflicts in current config', () => {
    const issues = validateRoutingConsistency();
    assert.deepStrictEqual(issues, []);
  });
});
