'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildContextModePrompt } = require('../../../.claude/lib/spawn/prompt-factory.cjs');

test('buildContextModePrompt returns fragment and tool set for context/mode', () => {
  const result = buildContextModePrompt({
    contextName: 'claude-code',
    modeNames: ['planning'],
    role: 'developer',
  });

  assert.equal(result.hasContextOrMode, true);
  assert.ok(result.promptFragment.includes('## Context / Mode'));
  assert.ok(result.promptFragment.toLowerCase().includes('planning mode'));
  assert.ok(!result.activeToolNames.includes('Write'));
  assert.ok(!result.activeToolNames.includes('Edit'));
  assert.ok(!result.activeToolNames.includes('Bash'));
  assert.ok(!result.activeToolNames.includes('NotebookEdit'));
});

test('buildContextModePrompt returns empty fragment when no context/mode', () => {
  const result = buildContextModePrompt({
    contextName: null,
    modeNames: [],
    role: 'developer',
  });

  assert.equal(result.hasContextOrMode, false);
  assert.equal(result.promptFragment, '');
});
