#!/usr/bin/env node
/**
 * Test: reflection-step0-guard no longer deadlocks
 * RED: Before fix - guard blocks indefinitely when pending reflections exceed 5
 * GREEN: After fix - guard auto-clears old reflections and allows Router to proceed
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude/context/runtime');
const _SPAWN_REQUEST_PATH = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const _REMINDER_PATH = path.join(RUNTIME_DIR, 'reflection-reminder.txt');

test('Task 1.2: reflection-step0-guard has max pending limit (5)', async () => {
  const guardPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/reflection/reflection-step0-guard.cjs'
  );
  const content = fs.readFileSync(guardPath, 'utf8');

  // Should contain a MAX_PENDING constant or similar check
  const hasMaxPendingCheck =
    content.includes('MAX_PENDING') ||
    content.includes('max pending') ||
    content.includes('length > 5') ||
    content.includes('slice(0, 5)') ||
    content.includes('slice(-5)');

  assert.ok(
    hasMaxPendingCheck,
    'reflection-step0-guard should implement a maximum pending reflections check (5)'
  );
});

test('Task 1.2: reflection-step0-guard default mode is "warn" not "block"', async () => {
  const guardPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/reflection/reflection-step0-guard.cjs'
  );
  const content = fs.readFileSync(guardPath, 'utf8');

  // Find getEnforcementMode call
  const enforcementPattern = /getEnforcementMode\('REFLECTION_STEP0_ENFORCEMENT',\s*'(\w+)'\)/;
  const match = content.match(enforcementPattern);

  assert.ok(match, 'Should find REFLECTION_STEP0_ENFORCEMENT getEnforcementMode call');
  assert.strictEqual(
    match[1],
    'warn',
    'REFLECTION_STEP0_ENFORCEMENT default should be "warn" (not block to avoid deadlock)'
  );
});

test('Task 1.2: reflection-step0-guard emits warning instead of blocking by default', async () => {
  const guardPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/reflection/reflection-step0-guard.cjs'
  );
  const content = fs.readFileSync(guardPath, 'utf8');

  // Behavior check: should NOT block indefinitely
  // Should contain logic to allow TaskList after noting pending reflections
  const hasAllowLogic =
    content.includes('process.exit(0)') && content.includes('formatResult(\'warn\'');

  assert.ok(
    hasAllowLogic,
    'reflection-step0-guard should allow TaskList with warning (not block indefinitely)'
  );
});
