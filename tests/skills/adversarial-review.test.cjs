'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.resolve(__dirname, '../../.claude/skills/adversarial-review/SKILL.md');

test('adversarial-review SKILL.md contains halt-on-zero-findings workflow', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /halt.on.zero|zero.findings/i, 'Must contain halt-on-zero-findings');
});

test('adversarial-review SKILL.md contains Certified Clean concept', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /certified clean/i, 'Must contain Certified Clean override');
});

test('adversarial-review SKILL.md contains re-analysis requirement', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /re.analy/i, 'Must contain re-analysis step');
});

test('adversarial-review SKILL.md contains ADVERSARIAL_REVIEW env var', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf8');
  assert.match(content, /ADVERSARIAL_REVIEW/, 'Must reference ADVERSARIAL_REVIEW env var');
});
