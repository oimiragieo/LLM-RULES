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
  // Exact match first, then prefix/substring match for extended matchers
  return (
    blocks.find(b => b.matcher === matcher) ||
    blocks.find(b => b.matcher && b.matcher.startsWith(matcher)) ||
    null
  );
}

function listCommands(block) {
  // Handle both formats:
  // 1. "node .claude/hooks/foo.cjs"
  // 2. 'cd "C:/dev/..." && node .claude/hooks/foo.cjs'
  return (block?.hooks || [])
    .map(h => {
      if (!h.command) return null;
      const nodeMatch = h.command.match(/node\s+([^\s"]+\.(?:cjs|mjs|js))/);
      if (nodeMatch) return 'node ' + nodeMatch[1];
      return h.command;
    })
    .filter(Boolean);
}

test('PreToolUse Edit|Write|NotebookEdit includes write-pretool-bundle', () => {
  const block = findHookBlock('PreToolUse', 'Edit|Write|NotebookEdit');
  assert.ok(block, 'Expected PreToolUse block for Edit|Write|NotebookEdit');

  const commands = listCommands(block);
  assert.ok(
    commands.includes('node .claude/hooks/safety/write-pretool-bundle.cjs'),
    'write-pretool-bundle.cjs should be wired for Edit/Write/NotebookEdit'
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
    commands.includes('node .claude/hooks/routing/user-prompt-unified.cjs'),
    'UserPromptSubmit should include unified orchestrator hook'
  );
});

test('PreToolUse TaskUpdate runs contract validator before transition validators', () => {
  const block = findHookBlock('PreToolUse', 'TaskUpdate');
  assert.ok(block, 'Expected PreToolUse block for TaskUpdate');

  const commands = listCommands(block);
  const contractIdx = commands.indexOf(
    'node .claude/hooks/validation/taskupdate-contract-validator.cjs'
  );
  const transitionIdx = commands.indexOf(
    'node .claude/hooks/validation/pre-completion-validation.cjs'
  );
  assert.ok(contractIdx !== -1, 'TaskUpdate contract validator should be wired');
  assert.ok(transitionIdx !== -1, 'pre-completion-validation should be wired');
  assert.ok(
    contractIdx < transitionIdx,
    'Contract validator should run before transition validation'
  );
});

test('PostToolUse TaskUpdate includes artifact scoring ledger hook after completion chain', () => {
  const block = findHookBlock('PostToolUse', 'TaskUpdate');
  assert.ok(block, 'Expected PostToolUse block for TaskUpdate');

  const commands = listCommands(block);
  const completionIdx = commands.indexOf('node .claude/hooks/workflow/post-completion-chain.cjs');
  const scoringIdx = commands.indexOf(
    'node .claude/hooks/quality/artifact-scoring-ledger-hook.cjs'
  );
  assert.ok(completionIdx !== -1, 'post-completion-chain should be wired');
  assert.ok(scoringIdx !== -1, 'artifact-scoring-ledger-hook should be wired');
  assert.ok(
    completionIdx < scoringIdx,
    'artifact-scoring-ledger-hook should run after post-completion-chain'
  );
});
