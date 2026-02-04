'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContextModePrompt } = require('../../.claude/lib/spawn/prompt-factory.cjs');
const {
  evaluateToolGuard,
  getToolNameFromInput,
} = require('../../.claude/hooks/routing/context-mode-tool-guard.cjs');

test('getToolNameFromInput reads common fields', () => {
  assert.equal(getToolNameFromInput({ tool_name: 'Write' }), 'Write');
  assert.equal(getToolNameFromInput({ tool: 'Edit' }), 'Edit');
  assert.equal(getToolNameFromInput({ toolName: 'Bash' }), 'Bash');
  assert.equal(getToolNameFromInput({ tool_input: { tool_name: 'Read' } }), 'Read');
});

test('evaluateToolGuard blocks disallowed tools in block mode', () => {
  const contextMode = buildContextModePrompt({
    role: 'developer',
    contextName: 'claude-code',
    modeNames: ['planning'],
  });

  const decision = evaluateToolGuard('Write', contextMode.activeToolNames, 'block');

  assert.equal(decision.action, 'block');
  assert.match(decision.message, /not allowed/i);
});

test('evaluateToolGuard allows allowed tools', () => {
  const contextMode = buildContextModePrompt({
    role: 'developer',
    contextName: 'claude-code',
    modeNames: ['planning'],
  });

  const decision = evaluateToolGuard('Read', contextMode.activeToolNames, 'block');

  assert.equal(decision.action, 'allow');
});

test('evaluateToolGuard warns in warn mode', () => {
  const contextMode = buildContextModePrompt({
    role: 'developer',
    contextName: 'claude-code',
    modeNames: ['planning'],
  });

  const decision = evaluateToolGuard('Bash', contextMode.activeToolNames, 'warn');

  assert.equal(decision.action, 'warn');
});
