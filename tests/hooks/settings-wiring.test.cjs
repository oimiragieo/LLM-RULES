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

test('UserPromptSubmit includes orchestrator hook in command chain', () => {
  const block = findHookBlock('UserPromptSubmit', '');
  assert.ok(block, 'Expected UserPromptSubmit block for default matcher');

  const commands = listCommands(block);
  assert.ok(commands.length >= 1, 'UserPromptSubmit should have at least one command hook');
  assert.ok(
    commands.includes('node .claude/hooks/session/user-prompt-orchestrator.cjs'),
    'UserPromptSubmit should include orchestrator hook'
  );
});

test('PreToolUse TaskUpdate runs contract validator before transition validators', () => {
  const block = findHookBlock('PreToolUse', 'TaskUpdate');
  assert.ok(block, 'Expected PreToolUse block for TaskUpdate');

  const commands = listCommands(block);
  const contractIdx = commands.indexOf(
    'node .claude/hooks/validation/taskupdate-contract-validator.cjs'
  );
  const transitionIdx = commands.indexOf('node .claude/hooks/validation/pre-completion-validation.cjs');
  assert.ok(contractIdx !== -1, 'TaskUpdate contract validator should be wired');
  assert.ok(transitionIdx !== -1, 'pre-completion-validation should be wired');
  assert.ok(contractIdx < transitionIdx, 'Contract validator should run before transition validation');
});
