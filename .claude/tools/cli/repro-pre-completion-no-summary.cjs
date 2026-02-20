#!/usr/bin/env node
'use strict';
/**
 * Reproduce: TaskUpdate(completed) without metadata.summary
 * Pipes minimal PreToolUse-style input to pre-completion-validation.cjs and captures exit + logs.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const hookPath = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'validation',
  'pre-completion-validation.cjs'
);
// Case A: no metadata.summary (should block)
// Case B: minimal summary "Completed task 2" (currently passes - possible bug)
const argv = process.argv.slice(2);
const withMinimalSummary = argv[0] === '--with-minimal-summary';
const input = JSON.stringify({
  tool_name: 'TaskUpdate',
  tool_input: withMinimalSummary
    ? { status: 'completed', taskId: '1', metadata: { summary: 'Completed task 2' } }
    : { status: 'completed', taskId: '1' },
});
const r = spawnSync(process.execPath, [hookPath], {
  input,
  cwd: PROJECT_ROOT,
  encoding: 'utf8',
  timeout: 10000,
});
console.log('Exit code:', r.status);
console.log('Stdout:', r.stdout || '(none)');
console.log('Stderr:', r.stderr || '(none)');
process.exit(r.status === 2 ? 0 : 1);
