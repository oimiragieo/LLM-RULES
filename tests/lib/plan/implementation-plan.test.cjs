'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const { load, save, createMinimal } = require('../../../.claude/lib/plan/implementation-plan.cjs');

function makePlanDir() {
  const base = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'impl-plan-'));
}

test('implementation-plan save/load roundtrip', () => {
  const planDir = makePlanDir();
  const plan = createMinimal('Feature X');
  assert.equal(save(planDir, plan), true);
  const loaded = load(planDir);
  assert.equal(loaded.feature, 'Feature X');
});

test('implementation-plan uses safeParseJSON when loading files', () => {
  const modulePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'plan',
    'implementation-plan.cjs'
  );
  const src = fs.readFileSync(modulePath, 'utf8');
  assert.match(src, /safeParseJSON/);
});
