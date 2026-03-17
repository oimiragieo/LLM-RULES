'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/plan-generator/SKILL.md');

test('plan-generator contains Previous Task Intelligence section', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(
    content,
    /previous task intelligence|cross-task/i,
    'Should have a Previous Task Intelligence or Cross-Task section'
  );
});

test('plan-generator references git log for recent context', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /git log/i, 'Should reference git log for recent commits');
});

test('plan-generator references decisions.md', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /decisions\.md/i, 'Should reference decisions.md for recent decisions');
});
