/**
 * Tests for code-semantic-search skill documentation
 * Task #54: Enhance code-semantic-search skill for Phase 2 hybrid search
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SKILL_DIR = path.join(PROJECT_ROOT, '.claude/skills/code-semantic-search');
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md');

test('code-semantic-search skill file exists', () => {
  assert.ok(fs.existsSync(SKILL_FILE), 'SKILL.md should exist');
});

test('SKILL.md has required sections', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes('# Code Semantic Search'), 'Should have title');
  assert.ok(content.includes('## Overview'), 'Should have Overview section');
  assert.ok(content.includes('## Phase 2: Hybrid Search'), 'Should have Phase 2 section');
  assert.ok(content.includes('## When to Use'), 'Should have When to Use section');
  assert.ok(content.includes('## Usage Examples'), 'Should have Usage Examples section');
});

test('SKILL.md documents three search modes', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes('Hybrid (Default)'), 'Should document hybrid mode');
  assert.ok(content.includes('Semantic-Only'), 'Should document semantic-only mode');
  assert.ok(content.includes('Structural-Only'), 'Should document structural-only mode');
});

test('SKILL.md includes performance comparison table', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes('| Mode |'), 'Should have performance table');
  assert.ok(content.includes('| Speed |'), 'Should have Speed column');
  assert.ok(content.includes('| Accuracy |'), 'Should have Accuracy column');
  assert.ok(content.includes('| Best For |'), 'Should have Best For column');
});

test('SKILL.md has code examples for all modes', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes("Skill({ skill: 'code-semantic-search'"), 'Should have basic example');
  assert.ok(content.includes("mode: 'semantic-only'"), 'Should have semantic-only example');
  assert.ok(content.includes("mode: 'structural-only'"), 'Should have structural-only example');
});

test('SKILL.md references hybrid-search.cjs implementation', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes('.claude/lib/code-indexing/hybrid-search.cjs'), 'Should reference hybrid-search.cjs');
});

test('SKILL.md has Memory Protocol section', () => {
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');

  assert.ok(content.includes('## Memory Protocol'), 'Should have Memory Protocol section');
  assert.ok(content.includes('learnings.md'), 'Should reference learnings.md');
});
