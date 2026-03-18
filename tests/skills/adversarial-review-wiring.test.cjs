'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('adversarial-review skill wiring', () => {
  test('SKILL.md exists', () => {
    const skillPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'skills',
      'adversarial-review',
      'SKILL.md'
    );
    assert.ok(fs.existsSync(skillPath), 'adversarial-review SKILL.md must exist');
  });

  test('skill produces structured findings (has finding format)', () => {
    const skillPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'skills',
      'adversarial-review',
      'SKILL.md'
    );
    const content = fs.readFileSync(skillPath, 'utf8');
    assert.ok(
      content.includes('finding') || content.includes('Finding') || content.includes('issue'),
      'Skill should describe finding/issue output'
    );
  });

  test('code-reviewer.md references the skill', () => {
    const agentPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'agents',
      'specialized',
      'code-reviewer.md'
    );
    const content = fs.readFileSync(agentPath, 'utf8');
    assert.ok(
      content.includes('adversarial-review'),
      'code-reviewer.md must reference adversarial-review skill'
    );
  });

  test('finding count is advisory (not hard enforced)', () => {
    const skillPath = path.resolve(
      __dirname,
      '..',
      '..',
      '.claude',
      'skills',
      'adversarial-review',
      'SKILL.md'
    );
    const content = fs.readFileSync(skillPath, 'utf8');
    // Advisory means it shouldn't hard-block on zero findings
    const hasAdvisory =
      content.toLowerCase().includes('advisory') ||
      content.toLowerCase().includes('warning') ||
      content.toLowerCase().includes('re-analy');
    assert.ok(hasAdvisory, 'Finding count should be advisory, not mandatory blocking');
  });
});
