'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const {
  buildResetPlan,
  normalizeScope,
} = require('../../../.claude/lib/utils/context-reset.cjs');

test('normalizeScope defaults to soft', () => {
  assert.equal(normalizeScope(''), 'soft');
  assert.equal(normalizeScope('unknown'), 'soft');
  assert.equal(normalizeScope('memory'), 'memory');
});

test('buildResetPlan includes runtime and metrics for soft scope', () => {
  const plan = buildResetPlan('soft');
  const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
  const metricsDir = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
  assert.ok(plan.targets.some(t => t.path === runtimeDir));
  assert.ok(plan.targets.some(t => t.path === metricsDir));
  assert.ok(!plan.targets.some(t => t.path.endsWith(path.join('context', 'memory'))));
});

test('buildResetPlan includes memory for memory scope', () => {
  const plan = buildResetPlan('memory');
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  assert.ok(plan.targets.some(t => t.path === memoryDir));
});

test('buildResetPlan includes full system targets', () => {
  const plan = buildResetPlan('full');
  const codeIndexDir = path.join(PROJECT_ROOT, '.claude', 'context', 'code-index');
  const routingPrototypes = path.join(
    PROJECT_ROOT,
    '.claude',
    'config',
    'routing-prototypes.json'
  );
  assert.ok(plan.targets.some(t => t.path === codeIndexDir));
  assert.ok(plan.targets.some(t => t.path === routingPrototypes));
});

test('buildResetPlan can include lancedb', () => {
  const plan = buildResetPlan('full', { includeLanceDb: true });
  const lancedbDir = path.join(PROJECT_ROOT, '.claude', 'data', 'lancedb');
  assert.ok(plan.targets.some(t => t.path === lancedbDir));
});
