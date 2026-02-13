#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const bundle = require('../../.claude/hooks/safety/bash-pretool-bundle.cjs');

describe('bash-pretool-bundle', () => {
  it('exports expected helpers', () => {
    assert.strictEqual(typeof bundle.tryParseJson, 'function');
    assert.strictEqual(typeof bundle.applyHookOutput, 'function');
    assert.strictEqual(typeof bundle.main, 'function');
    assert.ok(Array.isArray(bundle.HOOKS));
    assert.strictEqual(bundle.HOOKS.length, 4);
  });

  it('applyHookOutput keeps input when hook output is not json', () => {
    const input = JSON.stringify({ tool_input: { command: 'echo hi' }, tool_name: 'Bash' });
    const next = bundle.applyHookOutput(input, 'plain warning text');
    assert.strictEqual(next, input);
  });

  it('applyHookOutput keeps input when json has no tool_input', () => {
    const input = JSON.stringify({ tool_input: { command: 'echo hi' }, tool_name: 'Bash' });
    const next = bundle.applyHookOutput(input, JSON.stringify({ ok: true }));
    assert.strictEqual(next, input);
  });

  it('applyHookOutput replaces tool_input when hook returns transformed tool_input', () => {
    const input = JSON.stringify({
      tool_input: { command: 'echo hi >/dev/null' },
      tool_name: 'Bash',
    });
    const hookOut = JSON.stringify({ tool_input: { command: 'echo hi > NUL' } });
    const next = bundle.applyHookOutput(input, hookOut);
    const parsed = JSON.parse(next);
    assert.deepStrictEqual(parsed.tool_input, { command: 'echo hi > NUL' });
    assert.strictEqual(parsed.tool_name, 'Bash');
  });
});
