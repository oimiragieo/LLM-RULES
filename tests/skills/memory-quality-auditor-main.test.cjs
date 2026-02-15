#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const memoryAuditor = require('../../.claude/skills/memory-quality-auditor/scripts/main.cjs');

test('memory-quality-auditor returns summary metrics', () => {
  const result = memoryAuditor.main({ mode: 'summary' });
  assert.equal(result.ok, true);
  assert.ok(typeof result.metrics === 'object');
  assert.ok(Array.isArray(result.failed));
});
