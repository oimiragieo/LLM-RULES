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
  'implementation-readiness',
  'SKILL.md'
);

describe('implementation-readiness skill', () => {
  test('SKILL.md exists', () => {
    assert.ok(fs.existsSync(SKILL_PATH), 'implementation-readiness SKILL.md must exist');
  });

  test('contains all 5 readiness checks', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('Plan Completeness'), 'Missing Check 1: Plan Completeness');
    assert.ok(
      content.includes('Architecture Compliance'),
      'Missing Check 2: Architecture Compliance'
    );
    assert.ok(content.includes('Dependency Graph'), 'Missing Check 3: Dependency Graph Validity');
    assert.ok(content.includes('Risk Assessment'), 'Missing Check 4: Risk Assessment');
    assert.ok(content.includes('Test Strategy'), 'Missing Check 5: Test Strategy');
  });

  test('specifies skip for TRIVIAL/LOW complexity', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('TRIVIAL'), 'Must mention TRIVIAL skip');
    assert.ok(content.includes('LOW'), 'Must mention LOW skip');
  });

  test('produces structured pass/fail verdict', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.includes('"verdict"'), 'Must have verdict in output format');
    assert.ok(content.includes('"checks"'), 'Must have checks in output format');
    assert.ok(content.includes('"blockers"'), 'Must have blockers in output format');
  });

  test('has valid frontmatter', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(content.startsWith('---'), 'Must start with frontmatter');
    assert.ok(content.includes('name: implementation-readiness'), 'Must have name in frontmatter');
  });

  test('integrates with router-decision.md Step 7', () => {
    const content = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(
      content.includes('router-decision.md'),
      'Must reference router-decision.md integration'
    );
  });
});
