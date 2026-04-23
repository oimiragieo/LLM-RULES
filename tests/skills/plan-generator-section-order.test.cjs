'use strict';

// Agent: general-purpose | Task: #SD | Session: 2026-04-20
// Tests that plan-generator SKILL.md enforces the canonical 6-section order.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/plan-generator/SKILL.md');

const CANONICAL_SECTIONS = [
  '## Problem',
  '## Decision',
  '## Scope',
  '## Risks',
  '## Steps',
  '## Done Criteria',
];

test('plan-generator SKILL.md contains Canonical Section Order heading', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /canonical section order/i,
    'Should have a Canonical Section Order section'
  );
});

test('plan-generator SKILL.md lists all 6 canonical sections', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  for (const section of CANONICAL_SECTIONS) {
    assert.ok(content.includes(section), `SKILL.md should mention canonical section: ${section}`);
  }
});

test('plan-generator SKILL.md lists canonical sections in correct order within the Canonical Section Order block', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  // Find the canonical section order block and extract just that portion
  const blockStart = content.indexOf('## Canonical Section Order');
  assert.ok(blockStart >= 0, 'Canonical Section Order block must exist');
  // Find the next ## heading at the same level to define end of block
  const nextH2 = content.indexOf('\n## ', blockStart + 1);
  const block = nextH2 >= 0 ? content.slice(blockStart, nextH2) : content.slice(blockStart);

  // Each canonical section must appear in the block and in the correct order
  const foundIndices = CANONICAL_SECTIONS.map(s => block.indexOf(s));
  for (let i = 0; i < CANONICAL_SECTIONS.length; i++) {
    assert.ok(
      foundIndices[i] >= 0,
      `Section "${CANONICAL_SECTIONS[i]}" not found in Canonical Section Order block`
    );
  }
  for (let i = 1; i < foundIndices.length; i++) {
    assert.ok(
      foundIndices[i] > foundIndices[i - 1],
      `Section "${CANONICAL_SECTIONS[i]}" must appear after "${CANONICAL_SECTIONS[i - 1]}" in the canonical block`
    );
  }
});

test('plan-generator SKILL.md Iron Law #7 mentions canonical section order', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  // Iron Law 7 should reference canonical section enforcement
  assert.match(
    content,
    /iron law.*7|7\..*(canonical|section|order)|canonical.*iron law/is,
    'Iron Law 7 should reference canonical section ordering'
  );
});

test('plan-generator SKILL.md explains why fixed order matters', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /ai.generated|automated validation|slopped/i,
    'Should explain why fixed ordering is enforced'
  );
});

test('plan-generator SKILL.md references pre-completion-validation for enforcement', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /pre-completion-validation/i,
    'Should reference pre-completion-validation hook as enforcement mechanism'
  );
});
