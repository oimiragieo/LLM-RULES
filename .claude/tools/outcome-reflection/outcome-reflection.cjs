#!/usr/bin/env node
'use strict';

/**
 * outcome-reflection — Companion CLI Tool
 *
 * Scores predicted vs actual task outcomes to calibrate agent estimation accuracy.
 *
 * Usage:
 *   node .claude/tools/outcome-reflection/outcome-reflection.cjs \
 *     --taskId task-42 \
 *     --predicted '{"estimatedTokens":5000,"estimatedFiles":3}' \
 *     --actual '{"actualTokens":7200,"actualFiles":5,"reworkLoops":1}'
 *
 *   node .claude/tools/outcome-reflection/outcome-reflection.cjs \
 *     --analyze --agentType developer --last 10
 *
 *   node .claude/tools/outcome-reflection/outcome-reflection.cjs --help
 */

const path = require('path');
const { execFileSync } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..', '..', 'skills', 'outcome-reflection');
const PRE_HOOK = path.join(SKILL_ROOT, 'hooks', 'pre-execute.cjs');
const MAIN_SCRIPT = path.join(SKILL_ROOT, 'scripts', 'main.cjs');

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------
const HELP = `
outcome-reflection — Agent calibration scoring tool

USAGE
  node outcome-reflection.cjs --taskId <id> [options]
  node outcome-reflection.cjs --analyze [options]
  node outcome-reflection.cjs --help

MODES
  reflect (default)   Score a single completed task
  analyze / trend     Trend summary across recent tasks

OPTIONS
  --taskId <id>           Task ID to score (required in reflect mode)
  --predicted <json>      Predictions object: estimatedTokens, estimatedFiles, estimatedSteps
  --actual <json>         Actuals object: actualTokens, actualFiles, actualSteps, reworkLoops
  --predictionScore <n>   Qualitative prediction quality (0.0–1.0)
  --analyze               Run trend analysis mode
  --trend                 Alias for --analyze
  --agentType <type>      Filter trend by agent type (e.g., developer)
  --taskType <type>       Filter trend by task type (e.g., implementation)
  --last <n>              Number of records to include in trend (default: 10)
  --skip-validation       Skip pre-execution validation (not recommended)
  --help                  Show this help text

EXAMPLES
  # Score a completed implementation task
  node outcome-reflection.cjs \\
    --taskId task-42 \\
    --predicted '{"estimatedTokens":5000,"estimatedFiles":3,"estimatedSteps":5}' \\
    --actual '{"actualTokens":7200,"actualFiles":5,"actualSteps":8,"reworkLoops":1}'

  # Score with qualitative prediction assessment
  node outcome-reflection.cjs \\
    --taskId task-42 \\
    --actual '{"actualTokens":4800,"actualFiles":3,"reworkLoops":0}' \\
    --predictionScore 0.9

  # Trend analysis for developer agent
  node outcome-reflection.cjs --analyze --agentType developer --last 20

OUTPUT
  JSON with: taskId, mode, scores, estimationDetails, flags, notes, reflectionQueued

EXIT CODES
  0  Success
  1  Error (invalid args, JSON parse failure)
  2  Validation failure (missing required fields)
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      args.help = true;
    } else if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      const val = next && !next.startsWith('--') ? next : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }

  // Pre-execution validation (unless explicitly skipped)
  if (!args['skip-validation'] && !args.analyze && !args.trend) {
    try {
      const hookInput = {
        taskId: args.taskId,
        mode: 'reflect',
        predictions: args.predicted ? JSON.parse(args.predicted) : {},
        actuals: args.actual ? JSON.parse(args.actual) : {},
      };
      execFileSync(process.execPath, [PRE_HOOK, JSON.stringify(hookInput)], {
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
      });
    } catch (err) {
      if (err.status === 2) {
        process.stderr.write(
          `[outcome-reflection] Validation failed. Run with --skip-validation to bypass.\n`
        );
        process.exit(2);
      }
      // Exit 1 from hook is non-fatal (hook error, not block)
    }
  }

  // Build passthrough args for main script
  const scriptArgs = [];
  const passthrough = [
    'taskId',
    'predicted',
    'actual',
    'predictionScore',
    'analyze',
    'trend',
    'agentType',
    'taskType',
    'last',
  ];
  for (const key of passthrough) {
    if (args[key] !== undefined) {
      scriptArgs.push(`--${key}`);
      if (args[key] !== true) {
        scriptArgs.push(String(args[key]));
      }
    }
  }

  if (scriptArgs.length === 0) {
    process.stderr.write(
      'ERROR: No arguments provided. Run with --help for usage.\n'
    );
    process.exit(1);
  }

  // Execute main script
  try {
    const result = execFileSync(process.execPath, [MAIN_SCRIPT, ...scriptArgs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    process.stdout.write(result.toString());
    process.exit(0);
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout.toString());
    if (err.stderr) process.stderr.write(err.stderr.toString());
    process.exit(err.status || 1);
  }
}

main();
