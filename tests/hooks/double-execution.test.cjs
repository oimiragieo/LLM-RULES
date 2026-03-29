/**
 * Double Hook Execution Tests
 *
 * Verifies that user-prompt-unified.cjs is properly registered in settings.json
 * as the primary UserPromptSubmit hook (the orchestrator pattern was removed
 * to simplify the hook chain).
 *
 * Original bug (M-3): force-step0-execution, state-reset, user-prompt-unified, and
 * drift-detector were registered BOTH in settings.json AND in the orchestrator's
 * HOOK_ORDER array, causing each to run twice per prompt.
 *
 * Fix: Removed user-prompt-orchestrator.cjs entirely. Now user-prompt-unified.cjs
 * is directly registered and handles the hook chain internally.
 *
 * Test execution: node --test tests/hooks/double-execution.test.cjs
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('UserPromptSubmit hook registration', () => {
  const settingsPath = path.join(PROJECT_ROOT, '.claude/settings.json');

  test('user-prompt-unified.cjs IS registered in settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const userPromptHooks = settings.hooks?.UserPromptSubmit || [];
    const registeredCommands = [];
    for (const group of userPromptHooks) {
      for (const hook of group.hooks || []) {
        if (hook.command) registeredCommands.push(hook.command);
      }
    }

    const unifiedRegistered = registeredCommands.some(cmd =>
      cmd.includes('user-prompt-unified.cjs')
    );
    assert.ok(unifiedRegistered, 'user-prompt-unified.cjs must be registered in settings.json');
  });

  test('user-prompt-orchestrator.cjs is NOT registered (deleted)', () => {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const userPromptHooks = settings.hooks?.UserPromptSubmit || [];
    const registeredCommands = [];
    for (const group of userPromptHooks) {
      for (const hook of group.hooks || []) {
        if (hook.command) registeredCommands.push(hook.command);
      }
    }

    const orchestratorRegistered = registeredCommands.some(cmd =>
      cmd.includes('user-prompt-orchestrator.cjs')
    );
    assert.ok(
      !orchestratorRegistered,
      'user-prompt-orchestrator.cjs should NOT be registered (it was deleted)'
    );
  });
});
