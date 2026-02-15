#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const skillUpdater = require('../../.claude/skills/skill-updater/scripts/main.cjs');

test('normalizeSkillRef resolves name and path variants', () => {
  const named = skillUpdater.normalizeSkillRef('tdd');
  assert.equal(named.skillName, 'tdd');
  assert.equal(named.skillPath, '.claude/skills/tdd/SKILL.md');

  const byPath = skillUpdater.normalizeSkillRef('.claude/skills/tdd/SKILL.md');
  assert.equal(byPath.skillName, 'tdd');
  assert.equal(byPath.skillPath, '.claude/skills/tdd/SKILL.md');
});

test('main returns actionable plan for existing skill', () => {
  const result = skillUpdater.main({
    skill: 'tdd',
    trigger: 'reflection',
    mode: 'plan',
    topic: 'tdd skill refresh',
  });

  assert.equal(result.ok, true);
  assert.equal(result.trigger, 'reflection');
  assert.equal(result.target.skillName, 'tdd');
  assert.equal(result.target.exists, true);
  assert.ok(Array.isArray(result.requiredInvocations));
  assert.ok(result.requiredInvocations.some(item => item.includes('research-synthesis')));
  assert.ok(Array.isArray(result.tddBacklog));
  assert.equal(result.tddBacklog.length, 4);
});

test('main fails with creator recommendation when target skill is missing', () => {
  const result = skillUpdater.main({
    skill: 'does-not-exist-xyz',
    trigger: 'evolve',
  });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'resolve_target');
  assert.match(result.recommendation, /skill-creator/i);
});
