'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowLock = path.join(
  process.cwd(),
  '.claude',
  'lib',
  'workflow',
  'workflow-state-lock.cjs'
);
const memoryLock = path.join(process.cwd(), '.claude', 'lib', 'memory', 'memory-tiers-lock.cjs');
const LOCK_ORDER = 'LOCK_ORDER: workflow-state -> memory-tiers';

test('workflow and memory lock modules declare same lock order contract', () => {
  const w = fs.readFileSync(workflowLock, 'utf8');
  const m = fs.readFileSync(memoryLock, 'utf8');

  assert.match(w, new RegExp(LOCK_ORDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(m, new RegExp(LOCK_ORDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
