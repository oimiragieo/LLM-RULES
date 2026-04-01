'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'bash-command-validator.cjs'
);

const {
  analyzeClaudeCodeDangerousPatterns,
  splitCompoundCommand,
} = require('../../.claude/hooks/safety/bash-command-validator.cjs');

function runHook(command) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    windowsHide: true,
  });

  const stdout = (result.stdout || '').trim();
  return {
    status: result.status,
    stdout,
    stderr: result.stderr || '',
    parsed: stdout ? JSON.parse(stdout) : null,
  };
}

test('splitCompoundCommand treats single ampersand as a segment separator', () => {
  assert.deepEqual(splitCompoundCommand('echo a & sudo whoami'), ['echo a', 'sudo whoami']);
});

test('single ampersand-separated dangerous segment is blocked', () => {
  const result = runHook('echo a & sudo whoami');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /segment 2|sudo|privilege/i);
});

test('dollar command substitution content is analyzed for dangerous patterns', () => {
  const analysis = analyzeClaudeCodeDangerousPatterns('echo $(python evil.py)');
  assert.equal(analysis.blocked, null);
  assert.deepEqual(
    analysis.matches.map(match => [match.segmentIndex, match.pattern.label]),
    [[2, 'python']]
  );

  const result = runHook('echo $(python evil.py)');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.parsed, 'Expected warning JSON output');
  assert.match(result.parsed.additionalContext, /segment 2 \(python\)/i);
});

test('backtick command substitution content is analyzed for dangerous patterns', () => {
  const analysis = analyzeClaudeCodeDangerousPatterns('echo `python evil.py`');
  assert.equal(analysis.blocked, null);
  assert.deepEqual(
    analysis.matches.map(match => [match.segmentIndex, match.pattern.label]),
    [[2, 'python']]
  );

  const result = runHook('echo `python evil.py`');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.parsed, 'Expected warning JSON output');
  assert.match(result.parsed.additionalContext, /segment 2 \(python\)/i);
});
