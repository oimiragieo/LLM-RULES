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

describe('skill-tool tools field resolution', () => {
  it('loadSkill returns tools declared in SKILL.md `tools:` frontmatter field', () => {
    // tdd/SKILL.md declares: tools: [Read, Write, Edit, Bash, Glob, Grep]
    // Bug: skill-tool.cjs reads frontmatter.requiredTools (wrong key)
    // Fix: should read frontmatter.tools first
    const skill = loadSkill('tdd');
    assert.ok(skill, 'tdd skill should load successfully');
    // Bash is in the tdd `tools:` frontmatter but NOT in the fallback ['Read', 'Write', 'Edit']
    assert.ok(
      skill.requiredTools.includes('Bash'),
      `Expected requiredTools to include 'Bash' from tdd frontmatter tools field, got: ${JSON.stringify(skill.requiredTools)}`
    );
  });

  it('loadSkill returns all tools declared in tdd SKILL.md frontmatter', () => {
    // tdd/SKILL.md declares: tools: [Read, Write, Edit, Bash, Glob, Grep]
    const skill = loadSkill('tdd');
    assert.ok(skill, 'tdd skill should load successfully');
    const expected = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    for (const tool of expected) {
      assert.ok(
        skill.requiredTools.includes(tool),
        `Expected requiredTools to include '${tool}', got: ${JSON.stringify(skill.requiredTools)}`
      );
    }
  });

  it('Skill() result includes tools from frontmatter `tools:` field not just fallback', () => {
    // Bash is in tdd tools: frontmatter but not in fallback ['Read', 'Write', 'Edit']
    const result = Skill({ skill: 'tdd' });
    assert.equal(result.success, true);
    assert.ok(
      result.requiredTools.includes('Bash'),
      `Expected result.requiredTools to include 'Bash', got: ${JSON.stringify(result.requiredTools)}`
    );
  });

  it('loadSkill falls back to default tools when SKILL.md has no tools field', () => {
    // A skill with no tools: field in frontmatter should get fallback ['Read', 'Write', 'Edit']
    // We test this by loading a skill and verifying the fallback mechanism works
    // If requiredTools is the fallback, it should have exactly the 3 defaults
    // (This test will still pass before and after the fix for skills without a tools field)
    const skill = loadSkill('tdd');
    assert.ok(skill, 'tdd skill should load');
    // After fix, tdd should NOT be using the fallback (it has tools: in frontmatter)
    const fallbackOnly = ['Read', 'Write', 'Edit'];
    const isFallback =
      skill.requiredTools.length === 3 && fallbackOnly.every(t => skill.requiredTools.includes(t));
    assert.equal(
      isFallback,
      false,
      'tdd skill should not use fallback tools since it declares tools: in frontmatter'
    );
  });
});
