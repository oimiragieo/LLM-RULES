/**
 * Double Hook Execution Tests
 *
 * Verifies that hooks managed by user-prompt-orchestrator.cjs are NOT
 * also directly registered in settings.json (which would cause double execution).
 *
 * Bug fix validated:
 * - M-3: force-step0-execution, state-reset, user-prompt-unified, and
 *   drift-detector were registered BOTH in settings.json AND in the
 *   orchestrator's HOOK_ORDER array, causing each to run twice per prompt.
 *
 * Test execution: node --test tests/hooks/double-execution.test.cjs
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('UserPromptSubmit hook double-execution prevention', () => {
  const settingsPath = path.join(PROJECT_ROOT, '.claude/settings.json');
  const orchestratorPath = path.join(
    PROJECT_ROOT,
    '.claude/hooks/session/user-prompt-orchestrator.cjs'
  );

  test('hooks in orchestrator HOOK_ORDER are not directly registered in settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const orchestratorSrc = fs.readFileSync(orchestratorPath, 'utf8');

    // Extract HOOK_ORDER paths from orchestrator source
    const hookOrderMatch = orchestratorSrc.match(
      /const HOOK_ORDER = \[([\s\S]*?)\];/
    );
    assert.ok(hookOrderMatch, 'Should find HOOK_ORDER array in orchestrator');

    const hookPaths = hookOrderMatch[1]
      .match(/'([^']+\.cjs)'/g)
      .map(s => s.replace(/'/g, ''));

    // Get all UserPromptSubmit hook commands from settings.json
    const userPromptHooks = settings.hooks?.UserPromptSubmit || [];
    const registeredCommands = [];
    for (const group of userPromptHooks) {
      for (const hook of group.hooks || []) {
        if (hook.command) {
          registeredCommands.push(hook.command);
        }
      }
    }

    // Verify none of the orchestrated hooks are also directly registered
    for (const hookPath of hookPaths) {
      const isRegistered = registeredCommands.some(cmd => cmd.includes(hookPath));
      assert.ok(
        !isRegistered,
        `Hook "${hookPath}" is managed by user-prompt-orchestrator but also directly ` +
          `registered in settings.json. This causes double execution. Remove from settings.json.`
      );
    }
  });

  test('user-prompt-orchestrator.cjs IS registered in settings.json', () => {
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
      orchestratorRegistered,
      'user-prompt-orchestrator.cjs must be registered in settings.json'
    );
  });
});
