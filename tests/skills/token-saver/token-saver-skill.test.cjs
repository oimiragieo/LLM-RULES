#!/usr/bin/env node
'use strict';

/**
 * Token-saver skill activation tests.
 * Verifies that the SKILL.md is documented correctly and .env.example
 * has AUTO_COMPRESSION_PHASE_3 properly documented.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SKILL_MD = path.join(
  PROJECT_ROOT,
  '.claude/skills/token-saver-context-compression/SKILL.md'
);
const ENV_EXAMPLE = path.join(PROJECT_ROOT, '.env.example');

test('SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_MD), `Expected SKILL.md at ${SKILL_MD}`);
});

test('SKILL.md has Activation section', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('## Activation'),
    'Expected "## Activation" section in SKILL.md'
  );
});

test('.env.example has AUTO_COMPRESSION_PHASE_3 documented', () => {
  const content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
  assert.ok(
    content.includes('AUTO_COMPRESSION_PHASE_3=1'),
    'Expected AUTO_COMPRESSION_PHASE_3=1 in .env.example'
  );
});

test('SKILL.md references 80K token threshold', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('80K'),
    'Expected 80K token threshold reference in SKILL.md'
  );
});

test('SKILL.md references compression-reminder.txt', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('compression-reminder.txt'),
    'Expected compression-reminder.txt reference in SKILL.md'
  );
});
