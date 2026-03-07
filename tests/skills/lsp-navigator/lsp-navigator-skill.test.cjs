#!/usr/bin/env node
'use strict';

/**
 * LSP Navigator skill contract tests.
 * Verifies SKILL.md documents all required operations, caveats, and tools.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SKILL_MD = path.join(PROJECT_ROOT, '.claude/skills/lsp-navigator/SKILL.md');
const DIAGNOSTICS_RUNNER = path.join(PROJECT_ROOT, '.claude/tools/cli/lsp-diagnostics-runner.cjs');

// ---------------------------------------------------------------------------
// Part 1: SKILL.md existence and content
// ---------------------------------------------------------------------------

test('SKILL.md exists at expected path', () => {
  assert.ok(fs.existsSync(SKILL_MD), `Expected SKILL.md at ${SKILL_MD}`);
});

test('SKILL.md documents goToDefinition operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('goToDefinition'), 'Expected goToDefinition in SKILL.md');
});

test('SKILL.md documents findReferences operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('findReferences'), 'Expected findReferences in SKILL.md');
});

test('SKILL.md documents hover operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('hover'), 'Expected hover in SKILL.md');
});

test('SKILL.md documents documentSymbol operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('documentSymbol'), 'Expected documentSymbol in SKILL.md');
});

test('SKILL.md documents workspaceSymbol operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('workspaceSymbol'), 'Expected workspaceSymbol in SKILL.md');
});

test('SKILL.md documents goToImplementation operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('goToImplementation'), 'Expected goToImplementation in SKILL.md');
});

test('SKILL.md documents prepareCallHierarchy operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('prepareCallHierarchy'), 'Expected prepareCallHierarchy in SKILL.md');
});

test('SKILL.md documents incomingCalls operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('incomingCalls'), 'Expected incomingCalls in SKILL.md');
});

test('SKILL.md documents outgoingCalls operation', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(content.includes('outgoingCalls'), 'Expected outgoingCalls in SKILL.md');
});

test('SKILL.md documents 1-based line and character requirement', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('1-based') || content.includes('1-Based'),
    'Expected 1-based line/character documentation in SKILL.md'
  );
});

test('SKILL.md documents .cjs file caveat (LSP returns empty for .cjs)', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('.cjs') && (content.includes('empty') || content.includes('limited')),
    'Expected .cjs file limitation/caveat documented in SKILL.md'
  );
});

test('SKILL.md references lsp-diagnostics-runner.cjs', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('lsp-diagnostics-runner.cjs'),
    'Expected reference to lsp-diagnostics-runner.cjs in SKILL.md'
  );
});

test('SKILL.md has When to Use section distinguishing LSP vs other tools', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('When to Use') || content.includes('## When'),
    'Expected "When to Use" section in SKILL.md'
  );
});

test('SKILL.md documents absolute file path requirement', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('absolute'),
    'Expected absolute path requirement documented in SKILL.md'
  );
});

test('SKILL.md has Iron Laws section', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    content.includes('Iron Laws') || content.includes('## Iron'),
    'Expected Iron Laws section in SKILL.md'
  );
});

test('SKILL.md documents Windows path normalization or SE-01 caveat', () => {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  // Either explicit Windows normalization docs or SE-01 reference or backslash mention
  const hasWindowsNote =
    content.includes('Windows') ||
    content.includes('SE-01') ||
    content.includes('backslash') ||
    content.includes('normalize') ||
    content.includes('forward slash');
  assert.ok(hasWindowsNote, 'Expected Windows path normalization documentation in SKILL.md');
});

// ---------------------------------------------------------------------------
// Part 2: Diagnostics runner tool
// ---------------------------------------------------------------------------

test('lsp-diagnostics-runner.cjs exists at expected path', () => {
  assert.ok(
    fs.existsSync(DIAGNOSTICS_RUNNER),
    `Expected lsp-diagnostics-runner.cjs at ${DIAGNOSTICS_RUNNER}`
  );
});

test('lsp-diagnostics-runner.cjs loads without errors', () => {
  // The module uses async main() at top level, so we can't require() it directly
  // without triggering main(). Instead verify it's valid JS by checking for syntax errors
  // using a child process.
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('node', ['--check', DIAGNOSTICS_RUNNER], {
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `Expected no syntax errors, got: ${result.stderr}`);
});

test('lsp-diagnostics-runner.cjs supports --check flag', () => {
  const content = fs.readFileSync(DIAGNOSTICS_RUNNER, 'utf8');
  assert.ok(
    content.includes('--check'),
    'Expected --check flag support in lsp-diagnostics-runner.cjs'
  );
});

test('lsp-diagnostics-runner.cjs supports dead-exports check type', () => {
  const content = fs.readFileSync(DIAGNOSTICS_RUNNER, 'utf8');
  assert.ok(
    content.includes('dead-exports'),
    'Expected dead-exports check in lsp-diagnostics-runner.cjs'
  );
});

test('lsp-diagnostics-runner.cjs supports broken-imports check type', () => {
  const content = fs.readFileSync(DIAGNOSTICS_RUNNER, 'utf8');
  assert.ok(
    content.includes('broken-imports'),
    'Expected broken-imports check in lsp-diagnostics-runner.cjs'
  );
});

test('lsp-diagnostics-runner.cjs uses shell: false for child process (security)', () => {
  const content = fs.readFileSync(DIAGNOSTICS_RUNNER, 'utf8');
  assert.ok(
    content.includes('shell: false'),
    'Expected shell: false in lsp-diagnostics-runner.cjs (SE-04 security requirement)'
  );
});

test('lsp-diagnostics-runner.cjs normalizes Windows backslash paths (SE-01)', () => {
  const content = fs.readFileSync(DIAGNOSTICS_RUNNER, 'utf8');
  assert.ok(
    content.includes('replace(/\\\\/g') || content.includes('replace(/\\\\\\\\'),
    'Expected backslash normalization in lsp-diagnostics-runner.cjs (SE-01)'
  );
});
