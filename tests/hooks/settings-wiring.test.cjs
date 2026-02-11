#!/usr/bin/env node
/**
 * Hook wiring regression tests for .claude/settings.json
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const settings = require(path.join(PROJECT_ROOT, '.claude', 'settings.json'));

function findHookBlock(eventName, matcher) {
  const blocks = settings?.hooks?.[eventName] || [];
  return blocks.find(b => b.matcher === matcher) || null;
}

function listCommands(block) {
  return (block?.hooks || []).map(h => h.command).filter(Boolean);
}

test('PreToolUse Edit|Write|NotebookEdit includes unified-pre-write-hook', () => {
  const block = findHookBlock('PreToolUse', 'Edit|Write|NotebookEdit');
  assert.ok(block, 'Expected PreToolUse block for Edit|Write|NotebookEdit');

  const commands = listCommands(block);
  assert.ok(
    commands.includes('node .claude/hooks/safety/unified-pre-write-hook.cjs'),
    'unified-pre-write-hook.cjs should be wired for Edit/Write/NotebookEdit'
  );
});

test('PostToolUse Edit|Write|NotebookEdit includes memory/index hooks', () => {
  const block = findHookBlock('PostToolUse', 'Edit|Write|NotebookEdit');
  assert.ok(block, 'Expected PostToolUse block for Edit|Write|NotebookEdit');

  const commands = listCommands(block);
  assert.ok(commands.includes('node .claude/hooks/memory/sync-memory-index.cjs'));
  assert.ok(commands.includes('node .claude/hooks/routing/code-index-updater.cjs'));
});

test('UserPromptSubmit uses single orchestrator hook', () => {
  const block = findHookBlock('UserPromptSubmit', '');
  assert.ok(block, 'Expected UserPromptSubmit block for default matcher');

  const commands = listCommands(block);
  assert.strictEqual(commands.length, 1, 'UserPromptSubmit should have exactly one command hook');
  assert.strictEqual(
    commands[0],
    'node .claude/hooks/session/user-prompt-orchestrator.cjs',
    'UserPromptSubmit should be wired to orchestrator hook'
  );
});
