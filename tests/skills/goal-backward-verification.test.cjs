'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'skills',
  'goal-backward-verification',
  'SKILL.md'
);

const QA_AGENT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'agents',
  'core',
  'qa.md'
);

describe('goal-backward-verification skill', () => {
  test('SKILL.md exists', () => {
    assert.ok(fs.existsSync(SKILL_PATH), `Skill file not found at ${SKILL_PATH}`);
  });

  test('contains all 4 verification level names', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('Level 1: Exists'), 'Missing Level 1: Exists');
    assert.ok(content.includes('Level 2: Substantive'), 'Missing Level 2: Substantive');
    assert.ok(content.includes('Level 3: Wired'), 'Missing Level 3: Wired');
    assert.ok(content.includes('Level 4: Functional'), 'Missing Level 4: Functional');
  });

  test('contains both mode names (strict/advisory)', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('Strict Mode'), 'Missing Strict Mode');
    assert.ok(content.includes('Advisory Mode'), 'Missing Advisory Mode');
  });

  test('contains structured output format', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('"verdict"'), 'Missing verdict in output format');
    assert.ok(content.includes('"levels"'), 'Missing levels in output format');
  });

  test('has valid frontmatter with name field', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.startsWith('---'), 'Skill must start with frontmatter');
    assert.ok(
      content.includes('name: goal-backward-verification'),
      'Frontmatter must include name'
    );
  });

  test('qa.md references the skill', () => {
    const qaContent = fs.readFileSync(QA_AGENT_PATH, 'utf8');
    assert.ok(
      qaContent.includes('goal-backward-verification'),
      'qa.md must reference goal-backward-verification skill'
    );
  });
});
