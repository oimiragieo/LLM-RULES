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
const lockOrderDoc = path.join(process.cwd(), '.claude', 'docs', 'LOCK_ORDER.md');
const LOCK_ORDER = 'LOCK_ORDER: workflow-state -> memory-tiers';

test('workflow and memory lock modules declare same lock order contract', () => {
  const w = fs.readFileSync(workflowLock, 'utf8');
  const m = fs.readFileSync(memoryLock, 'utf8');

  assert.match(w, new RegExp(LOCK_ORDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(m, new RegExp(LOCK_ORDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('central lock order documentation exists and matches contract', () => {
  const doc = fs.readFileSync(lockOrderDoc, 'utf8');
  assert.match(doc, new RegExp(LOCK_ORDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(doc, /workflow-state\.lock/i);
  assert.match(doc, /memory-tiers\.lock/i);
});
