'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeSkillBackedTool } = require('../../.claude/tools/_shared/skill-wrapper.cjs');

test('executeSkillBackedTool returns structured success payload', () => {
  const result = executeSkillBackedTool(
    'tdd',
    'tdd',
    { args: 'focus on red-green-refactor' },
    {
      skillFn: () => ({
        success: true,
        skill: 'tdd',
        displayName: 'TDD',
        description: 'Test-driven development',
        filePath: '.claude/skills/tdd/SKILL.md',
        message: 'loaded',
      }),
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.tool, 'tdd');
  assert.equal(result.loadedSkill, 'tdd');
  assert.equal(result.args, 'focus on red-green-refactor');
});

test('executeSkillBackedTool returns failure payload when skill missing', () => {
  const result = executeSkillBackedTool(
    'test-generator',
    'test-generator',
    {},
    {
      skillFn: () => ({ success: false, error: 'missing' }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.tool, 'test-generator');
  assert.match(result.error, /missing/);
});
