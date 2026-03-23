#!/usr/bin/env node
// .claude/tools/error-recovery-escalation/error-recovery-escalation.cjs
// Companion CLI tool — delegates to skills/error-recovery-escalation/scripts/main.cjs
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../skills/error-recovery-escalation/scripts/main.cjs'
);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`error-recovery-escalation — 5-level structured agent error recovery

Usage:
  echo '<json>' | node error-recovery-escalation.cjs [options]
  echo '<json>' | node error-recovery-escalation.cjs --classify
  echo '<json>' | node error-recovery-escalation.cjs --next-level
  echo '<json>' | node error-recovery-escalation.cjs --level <N>

Options:
  --classify      Classify the error type and return entry level only
  --next-level    Return the next escalation level given previousLevels
  --level <N>     Force entry at level N (1-5), overrides classification
  --help, -h      Show this help

Input JSON fields:
  taskId          (required) The task ID experiencing the error
  errorMessage    (required) The error message or description of failure
  errorType       (optional) Explicit error type — skips auto-classification
  previousLevels  (optional) Array of levels already attempted [1,2,3]
  completedSteps  (optional) Steps completed before failure (level 5 output)
  failedAt        (optional) The step that failed (level 5 output)
  recommendation  (optional) Human-facing resolution recommendation

Level quick reference:
  1  retry     Transient error, idempotent action, <3 attempts
  2  nudge     Wrong parameters, 3 retries exhausted
  3  replan    Wrong approach, nudges failed
  4  fallback  Wrong agent/model, replan failed
  5  force-done All levels failed OR external service down / missing credentials

Verdict formula (full result):
  level = classified entry level OR max(previousLevels)+1 if previousLevels provided
  action = LEVELS[level].action
  timeoutMs = LEVELS[level].timeoutMs (0 = no timeout at level 5)

Examples:
  echo '{"taskId":"t1","errorMessage":"Connection timed out"}' \\
    | node error-recovery-escalation.cjs

  echo '{"taskId":"t1","errorMessage":"ENOENT: file not found","previousLevels":[1]}' \\
    | node error-recovery-escalation.cjs

  echo '{"taskId":"t1","errorMessage":"API unavailable","errorType":"external-service-down"}' \\
    | node error-recovery-escalation.cjs
`);
  process.exit(0);
}

const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 0);
