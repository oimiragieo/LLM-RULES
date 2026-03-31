#!/usr/bin/env node
/**
 * hook-deduplication.test.cjs
 *
 * Verifies that duplicate hook registrations in settings.json have been
 * consolidated:
 *
 *   1. routing-guard.cjs   — exactly 1 PreToolUse registration with matcher
 *                            covering Glob|Grep|WebSearch|TaskCreate|TaskOutput
 *   2. write-pretool-bundle.cjs — exactly 1 PreToolUse registration with
 *                            matcher covering Edit|Write|NotebookEdit plus
 *                            mcp__filesystem__write_file|mcp__filesystem__edit_file
 *   3. sync-memory-index.cjs — exactly 1 PostToolUse registration with matcher
 *                            covering Edit|Write|NotebookEdit|MemoryRecord
 *
 * Tests VAL-HO-007, VAL-HO-008, VAL-HO-009.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Load settings.json ───────────────────────────────────────────────────────

let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`Failed to parse settings.json: ${err.message}`);
}

// ─── Helper: find all registrations for a script in an event category ────────

/**
 * Returns all { matcher, hook } entries where hook.command includes scriptName,
 * within the specified event category.
 *
 * @param {string} eventName - e.g. "PreToolUse"
 * @param {string} scriptName - basename, e.g. "routing-guard.cjs"
 * @returns {{ matcher: string, hook: Object }[]}
 */
function findRegistrations(eventName, scriptName) {
  const results = [];
  const groups = (settings.hooks || {})[eventName] || [];
  for (const group of groups) {
    const matcher = group.matcher || '';
    for (const hook of group.hooks || []) {
      if ((hook.command || '').includes(scriptName)) {
        results.push({ matcher, hook });
      }
    }
  }
  return results;
}

/**
 * Returns the combined matcher string for all tools covered by a registration.
 * Splits the matcher on "|" and returns the set of tool names.
 *
 * @param {string} matcher
 * @returns {Set<string>}
 */
function matcherTools(matcher) {
  return new Set((matcher || '').split('|').filter(Boolean));
}

// ─── Test: settings.json is valid JSON ───────────────────────────────────────

test('settings.json parses as valid JSON object with hooks', () => {
  assert.ok(settings && typeof settings === 'object', 'settings must be a JSON object');
  assert.ok(settings.hooks && typeof settings.hooks === 'object', 'settings must have hooks');
});

// ─── Test: routing-guard.cjs — VAL-HO-007 ────────────────────────────────────

test('routing-guard.cjs has exactly 1 PreToolUse registration (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(
    regs.length,
    1,
    `routing-guard.cjs should have exactly 1 PreToolUse registration, found ${regs.length}: ${JSON.stringify(regs.map(r => r.matcher))}`
  );
});

test('routing-guard.cjs PreToolUse matcher covers Glob (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Glob'), `Glob not in matcher "${regs[0].matcher}"`);
});

test('routing-guard.cjs PreToolUse matcher covers Grep (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Grep'), `Grep not in matcher "${regs[0].matcher}"`);
});

test('routing-guard.cjs PreToolUse matcher covers WebSearch (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('WebSearch'), `WebSearch not in matcher "${regs[0].matcher}"`);
});

test('routing-guard.cjs PreToolUse matcher covers TaskCreate (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('TaskCreate'), `TaskCreate not in matcher "${regs[0].matcher}"`);
});

test('routing-guard.cjs PreToolUse matcher covers TaskOutput (VAL-HO-007)', () => {
  const regs = findRegistrations('PreToolUse', 'routing-guard.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('TaskOutput'), `TaskOutput not in matcher "${regs[0].matcher}"`);
});

// ─── Test: write-pretool-bundle.cjs — VAL-HO-008 ─────────────────────────────

test('write-pretool-bundle.cjs has exactly 1 PreToolUse registration (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(
    regs.length,
    1,
    `write-pretool-bundle.cjs should have exactly 1 PreToolUse registration, found ${regs.length}: ${JSON.stringify(regs.map(r => r.matcher))}`
  );
});

test('write-pretool-bundle.cjs PreToolUse matcher covers Edit (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Edit'), `Edit not in matcher "${regs[0].matcher}"`);
});

test('write-pretool-bundle.cjs PreToolUse matcher covers Write (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Write'), `Write not in matcher "${regs[0].matcher}"`);
});

test('write-pretool-bundle.cjs PreToolUse matcher covers NotebookEdit (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('NotebookEdit'), `NotebookEdit not in matcher "${regs[0].matcher}"`);
});

test('write-pretool-bundle.cjs PreToolUse matcher covers mcp__filesystem__write_file (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(
    tools.has('mcp__filesystem__write_file'),
    `mcp__filesystem__write_file not in matcher "${regs[0].matcher}"`
  );
});

test('write-pretool-bundle.cjs PreToolUse matcher covers mcp__filesystem__edit_file (VAL-HO-008)', () => {
  const regs = findRegistrations('PreToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(
    tools.has('mcp__filesystem__edit_file'),
    `mcp__filesystem__edit_file not in matcher "${regs[0].matcher}"`
  );
});

// ─── Test: sync-memory-index.cjs — VAL-HO-009 ────────────────────────────────

test('sync-memory-index.cjs has exactly 1 PostToolUse registration (VAL-HO-009)', () => {
  const regs = findRegistrations('PostToolUse', 'sync-memory-index.cjs');
  assert.strictEqual(
    regs.length,
    1,
    `sync-memory-index.cjs should have exactly 1 PostToolUse registration, found ${regs.length}: ${JSON.stringify(regs.map(r => r.matcher))}`
  );
});

test('sync-memory-index.cjs PostToolUse matcher covers Edit (VAL-HO-009)', () => {
  const regs = findRegistrations('PostToolUse', 'sync-memory-index.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Edit'), `Edit not in matcher "${regs[0].matcher}"`);
});

test('sync-memory-index.cjs PostToolUse matcher covers Write (VAL-HO-009)', () => {
  const regs = findRegistrations('PostToolUse', 'sync-memory-index.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('Write'), `Write not in matcher "${regs[0].matcher}"`);
});

test('sync-memory-index.cjs PostToolUse matcher covers NotebookEdit (VAL-HO-009)', () => {
  const regs = findRegistrations('PostToolUse', 'sync-memory-index.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('NotebookEdit'), `NotebookEdit not in matcher "${regs[0].matcher}"`);
});

test('sync-memory-index.cjs PostToolUse matcher covers MemoryRecord (VAL-HO-009)', () => {
  const regs = findRegistrations('PostToolUse', 'sync-memory-index.cjs');
  assert.strictEqual(regs.length, 1, 'Expected exactly 1 registration');
  const tools = matcherTools(regs[0].matcher);
  assert.ok(tools.has('MemoryRecord'), `MemoryRecord not in matcher "${regs[0].matcher}"`);
});

// ─── Test: no duplicate registrations exist anywhere ─────────────────────────

test('routing-guard.cjs has no PostToolUse registrations (should only be PreToolUse)', () => {
  const regs = findRegistrations('PostToolUse', 'routing-guard.cjs');
  assert.strictEqual(
    regs.length,
    0,
    `routing-guard.cjs should not be in PostToolUse, found ${regs.length}`
  );
});

test('write-pretool-bundle.cjs has no PostToolUse registrations (should only be PreToolUse)', () => {
  const regs = findRegistrations('PostToolUse', 'write-pretool-bundle.cjs');
  assert.strictEqual(
    regs.length,
    0,
    `write-pretool-bundle.cjs should not be in PostToolUse, found ${regs.length}`
  );
});

// ─── Test: settings.json has all original event categories ───────────────────

test('settings.json preserves all 7 original event categories', () => {
  const expected = [
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SessionEnd',
    'PreCompact',
    'Stop',
  ];
  for (const cat of expected) {
    assert.ok(
      Array.isArray(settings.hooks[cat]),
      `Event category "${cat}" missing from settings.json`
    );
  }
});
