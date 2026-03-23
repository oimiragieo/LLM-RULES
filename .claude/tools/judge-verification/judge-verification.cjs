#!/usr/bin/env node
// tools/judge-verification/judge-verification.cjs
// Companion CLI tool for the judge-verification skill.
// Delegates execution to .claude/skills/judge-verification/scripts/main.cjs

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.resolve(__dirname, '../../skills/judge-verification/scripts/main.cjs');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
judge-verification — Independent task completion evaluator

USAGE:
  echo '<json>' | node judge-verification.cjs [OPTIONS]

OPTIONS:
  --verdict       Calculate and emit full verdict JSON
  --score-only    Emit totalScore, verdict, and evidenceGatePassed only
  --help          Show this help text

INPUT (stdin, JSON):
  {
    "taskId":     "<string>",           // required
    "taskGoal":   "<string>",           // required
    "scores": {
      "goalAlignment":        <0-25>,
      "actionCompleteness":   <0-25>,
      "evidenceOfCompletion": <0-25>,
      "finalStateCoherence":  <0-25>
    },
    "reasoning":  "<string>",
    "failureReasons": ["<string>"],     // optional
    "recommendations": ["<string>"]     // optional
  }

VERDICT FORMULA:
  PASS        => totalScore >= 70 AND evidenceOfCompletion >= 15
  CONDITIONAL => totalScore 60-69 AND evidenceOfCompletion >= 15
  FAIL        => totalScore < 60 OR evidenceOfCompletion < 15

EXAMPLES:
  echo '{"taskId":"t1","taskGoal":"Add auth","scores":{"goalAlignment":22,"actionCompleteness":20,"evidenceOfCompletion":18,"finalStateCoherence":21},"reasoning":"Tests pass."}' | node judge-verification.cjs --verdict

  echo '{"scores":{"goalAlignment":10,"actionCompleteness":8,"evidenceOfCompletion":5,"finalStateCoherence":12}}' | node judge-verification.cjs --score-only
`);
  process.exit(0);
}

// Delegate to main script
const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 0);
