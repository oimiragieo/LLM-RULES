#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillUpdater = require('../../.claude/skills/skill-updater/scripts/main.cjs');
const projectRoot = path.resolve(__dirname, '..', '..');
const routingTablePath = path.join(
  projectRoot,
  '.claude',
  'lib',
  'routing',
  'routing-table-intent-keywords-data.cjs'
);
const learningsPath = path.join(projectRoot, '.claude', 'context', 'memory', 'learnings.md');

function withTempSkill(skillName, content, fn) {
  const skillDir = path.join(projectRoot, '.claude', 'skills', skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillPath, content, 'utf8');
  try {
    return fn(skillPath);
  } finally {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }
}

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

test('main accepts stale_skill trigger', () => {
  const result = skillUpdater.main({
    skill: 'tdd',
    trigger: 'stale_skill',
    mode: 'plan',
  });
  assert.equal(result.ok, true);
  assert.equal(result.trigger, 'stale_skill');
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

test('plan mode does not update metadata or integration files', () => {
  const skillName = `tmp-plan-no-write-${Date.now()}`;
  const beforeRouting = fs.readFileSync(routingTablePath, 'utf8');
  const beforeLearnings = fs.readFileSync(learningsPath, 'utf8');

  withTempSkill(
    skillName,
    [
      '---',
      'name: temp-skill',
      'verified: false',
      'lastVerifiedAt: 2024-01-01T00:00:00.000Z',
      '---',
      '# Temp',
      '',
      'body',
    ].join('\n'),
    skillPath => {
      const beforeSkill = fs.readFileSync(skillPath, 'utf8');
      const result = skillUpdater.main({ skill: skillName, mode: 'plan', trigger: 'manual' });
      assert.equal(result.ok, true);
      const afterSkill = fs.readFileSync(skillPath, 'utf8');
      assert.equal(afterSkill, beforeSkill);
    }
  );

  const afterRouting = fs.readFileSync(routingTablePath, 'utf8');
  const afterLearnings = fs.readFileSync(learningsPath, 'utf8');
  assert.equal(afterRouting, beforeRouting);
  assert.equal(afterLearnings, beforeLearnings);
});

test('updateSkillMetadata uses frontmatter parser and preserves body horizontal rules', () => {
  const skillName = `tmp-frontmatter-${Date.now()}`;
  withTempSkill(
    skillName,
    [
      '---',
      'name: parser-test',
      'verified: false',
      'lastVerifiedAt: 2023-01-01T00:00:00.000Z',
      '---',
      '# Title',
      '',
      '---',
      '',
      'Keep this body marker untouched',
    ].join('\n'),
    skillPath => {
      skillUpdater.updateSkillMetadata(`.claude/skills/${skillName}/SKILL.md`);

      const updated = fs.readFileSync(skillPath, 'utf8');
      assert.match(updated, /verified:\s*true/);
      assert.match(updated, /lastVerifiedAt:\s*'?(\d{4}-\d{2}-\d{2}T[^']+)'?/);
      assert.match(updated, /\n# Title\n\n---\n\nKeep this body marker untouched/);
    }
  );
});

test('routing keyword update writes a valid JavaScript entry', () => {
  const skillName = `tmp-routing-${Date.now()}`;
  const before = fs.readFileSync(routingTablePath, 'utf8');
  try {
    skillUpdater.updateRoutingTableKeywords(skillName, '');
    const after = fs.readFileSync(routingTablePath, 'utf8');
    assert.match(after, new RegExp(`'${skillName}':\\s*\\[`));
    const { spawnSync } = require('node:child_process');
    const check = spawnSync(process.execPath, ['--check', routingTablePath], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr || check.stdout);
  } finally {
    fs.writeFileSync(routingTablePath, before, 'utf8');
  }
});
