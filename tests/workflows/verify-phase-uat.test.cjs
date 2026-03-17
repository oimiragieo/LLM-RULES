'use strict';
const { test } = require('node:test');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../');

test('verify-phase-uat workflow file exists', () => {
  const p = path.join(ROOT, '.claude/workflows/enterprise/verify-phase-uat.md');
  assert.ok(fs.existsSync(p), `Missing: ${p}`);
});

test('verify-phase-uat workflow contains acceptance criteria section', () => {
  const p = path.join(ROOT, '.claude/workflows/enterprise/verify-phase-uat.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /acceptance criteria/i);
});

test('verify-phase-uat workflow contains pass/fail/verdict language', () => {
  const p = path.join(ROOT, '.claude/workflows/enterprise/verify-phase-uat.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /pass|fail|verdict/i);
});

test('uat-verify skill file exists', () => {
  const p = path.join(ROOT, '.claude/skills/uat-verify/SKILL.md');
  assert.ok(fs.existsSync(p), `Missing: ${p}`);
});

test('uat-verify skill contains test execution and evidence language', () => {
  const p = path.join(ROOT, '.claude/skills/uat-verify/SKILL.md');
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /test|execut|verify/i);
  assert.match(content, /evidence|proof|screenshot|output/i);
});

test('uat-results template file exists with verdict and criteria sections', () => {
  const p = path.join(ROOT, '.claude/templates/uat-results.md');
  assert.ok(fs.existsSync(p), `Missing: ${p}`);
  const content = fs.readFileSync(p, 'utf8');
  assert.match(content, /verdict|result|status/i);
  assert.match(content, /criteria|requirement/i);
});
