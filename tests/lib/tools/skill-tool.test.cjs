const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  Skill,
  loadSkill,
  normalizeSkillName,
  SKILL_ALIASES,
} = require('../../../.claude/lib/tools/skill-tool.cjs');

describe('skill-tool aliases', () => {
  it('normalizes task-management alias to task-management-protocol', () => {
    assert.equal(normalizeSkillName('task-management'), 'task-management-protocol');
    assert.equal(SKILL_ALIASES['task-management'], 'task-management-protocol');
  });

  it('loads task-management alias skill successfully', () => {
    const skill = loadSkill('task-management');
    assert.ok(skill, 'alias should resolve to existing skill');
    assert.equal(skill.name, 'task-management-protocol');
  });

  it('Skill() resolves alias and reports requested skill', () => {
    const result = Skill({ skill: 'task-management' });
    assert.equal(result.success, true);
    assert.equal(result.skill, 'task-management-protocol');
    assert.equal(result.requestedSkill, 'task-management');
  });
});
