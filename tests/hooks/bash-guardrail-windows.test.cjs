'use strict';

const path = require('path');
// Use absolute path for reliable loading in test runner
const guardrailsPath = path.resolve(__dirname, '../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');
const canonicalizerPath = path.resolve(__dirname, '../../.claude/lib/utils/path-canonicalizer.cjs');

const { 
  isWindowsIncompatibleBashCommand,
  evaluateWindowsBashGuard 
} = require(guardrailsPath);

const { 
  canonicalizePathMentionsInText 
} = require(canonicalizerPath);

const assert = require('node:assert');
const test = require('node:test');

test('Bash Guardrail Windows Compatibility', async t => {
  await t.test('Detects unix-style drive paths as incompatible', () => {
    assert.strictEqual(isWindowsIncompatibleBashCommand('cd /c/dev && ls'), true);
    assert.strictEqual(isWindowsIncompatibleBashCommand('cat /d/project/file.txt'), true);
    assert.strictEqual(isWindowsIncompatibleBashCommand('ls .'), false);
  });

  await t.test('Canonicalizer rewrites unix-style paths correctly', () => {
    assert.strictEqual(
      canonicalizePathMentionsInText('cd /c/dev && ls'),
      process.platform === 'win32' ? 'cd C:\\dev && ls' : 'cd /c/dev && ls'
    );
  });

  await t.test('evaluateWindowsBashGuard rewrites in bypass mode', () => {
    if (process.platform !== 'win32') return;
    
    const command = 'cd /c/dev && ls';
    const hookInput = { permission_mode: 'bypassPermissions' };
    const result = evaluateWindowsBashGuard(command, hookInput);
    
    assert.strictEqual(result.action, 'rewrite');
    assert.strictEqual(result.rewrittenCommand, 'cd C:\\dev && ls');
  });
});
