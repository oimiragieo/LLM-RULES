#!/usr/bin/env node
// error-recovery-escalation/scripts/main.cjs
// Core logic for the 5-level error recovery escalation skill.

'use strict';

const path = require('path');

let safeParseJSON;
try {
  safeParseJSON = require(
    path.resolve(__dirname, '../../../../lib/utils/safe-json.cjs')
  ).safeParseJSON;
} catch {
  safeParseJSON = (str, fallback = {}) => {
    try {
      return { success: true, data: JSON.parse(str) };
    } catch (e) {
      return { success: false, data: fallback, error: e.message };
    }
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVELS = {
  RETRY: 1,
  NUDGE: 2,
  REPLAN: 3,
  FALLBACK: 4,
  FORCE_DONE: 5,
};

const LEVEL_NAMES = {
  1: 'retry',
  2: 'nudge',
  3: 'replan',
  4: 'fallback',
  5: 'force-done',
};

const LEVEL_TIMEOUTS_MS = {
  1: 30_000, // 30 seconds (3 retries × ~10s)
  2: 300_000, // 5 minutes
  3: 900_000, // 15 minutes
  4: 1_200_000, // 20 minutes
  5: 0, // No timeout — always emits output
};

// Error type → recommended entry level
const ERROR_CLASSIFICATION = {
  'network-timeout': LEVELS.RETRY,
  'rate-limit': LEVELS.RETRY,
  enoent: LEVELS.NUDGE,
  eperm: LEVELS.NUDGE,
  eacces: LEVELS.NUDGE,
  'wrong-output': LEVELS.NUDGE,
  'goal-misalignment': LEVELS.REPLAN,
  'judge-fail': LEVELS.REPLAN,
  'capability-mismatch': LEVELS.FALLBACK,
  'external-service-down': LEVELS.FORCE_DONE,
  'missing-credentials': LEVELS.FORCE_DONE,
  'loop-detected': LEVELS.REPLAN,
};

// Keyword → error type lookup (checked in order; first match wins)
const ERROR_KEYWORD_MAP = [
  { keywords: ['enoent', 'not found', 'no such file'], type: 'enoent' },
  { keywords: ['eperm', 'permission denied'], type: 'eperm' },
  { keywords: ['eacces', 'access denied'], type: 'eacces' },
  { keywords: ['timeout', 'timed out', 'etimedout'], type: 'network-timeout' },
  { keywords: ['rate limit', '429', 'too many requests'], type: 'rate-limit' },
  { keywords: ['goal', 'misalign'], type: 'goal-misalignment' },
  { keywords: ['judge', 'verdict'], type: 'judge-fail' },
  { keywords: ['loop', 'repeat', 'cycle'], type: 'loop-detected' },
  { keywords: ['unavailable', '503'], type: 'external-service-down' },
  { keywords: ['credential', 'api key'], type: 'missing-credentials' },
];

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Classify an error string into a recognized error type.
 * @param {string} errorMessage
 * @returns {string} error type key
 */
function classifyError(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();
  const match = ERROR_KEYWORD_MAP.find(entry => entry.keywords.some(kw => msg.includes(kw)));
  return match ? match.type : 'unknown';
}

/**
 * Determine the recommended entry level for a given error.
 * @param {string} errorType
 * @returns {number} level (1-5)
 */
function getEntryLevel(errorType) {
  return ERROR_CLASSIFICATION[errorType] || LEVELS.NUDGE;
}

/**
 * Build an escalation result object for a given level.
 * @param {Object} params
 * @param {string} params.taskId
 * @param {number} params.level
 * @param {string} params.errorType
 * @param {string} params.errorMessage
 * @param {number[]} params.previousLevels
 * @param {string[]} [params.completedSteps]
 * @param {string} [params.failedAt]
 * @param {string} [params.recommendation]
 * @returns {Object}
 */
function buildEscalationResult({
  taskId,
  level,
  errorType,
  errorMessage,
  previousLevels = [],
  completedSteps = [],
  failedAt = '',
  recommendation = '',
}) {
  const action = LEVEL_NAMES[level];
  const timeoutMs = LEVEL_TIMEOUTS_MS[level];
  const isForce = level === LEVELS.FORCE_DONE;

  const result = {
    taskId,
    level,
    action,
    errorType,
    errorMessage,
    previousLevels,
    timeoutMs,
    instructions: getLevelInstructions(level, errorType),
    taskUpdateMetadata: {
      recoveryLevel: level,
      recoveryAction: action,
      errorType,
      previousLevels,
      enteredAt: new Date().toISOString(),
    },
  };

  if (isForce) {
    result.partial = true;
    result.completedSteps = completedSteps;
    result.failedAt = failedAt;
    result.failureReason = errorMessage;
    result.recommendation =
      recommendation ||
      'Human review required. Check issues.md for root cause and retry when blocker is resolved.';
    result.taskUpdateMetadata.partial = true;
    result.taskUpdateMetadata.escalationPath = [...previousLevels, level];
    result.taskUpdateMetadata.completedSteps = completedSteps;
    result.taskUpdateMetadata.failedAt = failedAt;
    result.taskUpdateMetadata.recommendation = result.recommendation;
    result.taskUpdateMetadata.summary = `Force-done: partial results emitted after ${[...previousLevels, level].length}-level escalation`;
  }

  return result;
}

/**
 * Get human-readable instructions for a recovery level.
 * @param {number} level
 * @param {string} errorType
 * @returns {string[]}
 */
function getLevelInstructions(level, errorType) {
  switch (level) {
    case LEVELS.RETRY:
      return [
        'Retry the identical action unchanged.',
        'Apply exponential backoff: 1s, 2s, 4s between attempts.',
        'Maximum 3 retries. If all fail, escalate to Level 2 (nudge).',
        'Do NOT modify the action — retry means exact repetition.',
      ];

    case LEVELS.NUDGE:
      return [
        'Adjust parameters: try different file paths, keys, or simplified input.',
        'Keep the same overall goal and approach — only change parameters.',
        'Try 2-3 variants before escalating.',
        'If error is ENOENT: try .claude/context/tmp/, then absolute path.',
        'If error is wrong output: simplify input structure.',
        'Escalate to Level 3 (replan) if all nudge variants fail.',
      ];

    case LEVELS.REPLAN:
      return [
        'Abandon the current approach entirely.',
        'Invoke Skill({ skill: "plan-generator" }) for a new plan.',
        'Document the failed approach in task metadata as a known-bad path.',
        'New plan must avoid the specific failure mode that triggered escalation.',
        'Escalate to Level 4 (fallback) if the new plan also fails.',
      ];

    case LEVELS.FALLBACK:
      return [
        'Switch agent type or model tier.',
        errorType === 'capability-mismatch'
          ? 'Spawn devops-troubleshooter or appropriate specialist agent.'
          : 'Escalate model tier: haiku → sonnet, or sonnet → opus.',
        'Pass full context: what was tried, what failed, exact error messages.',
        'Escalate to Level 5 (force-done) if fallback agent also fails.',
      ];

    case LEVELS.FORCE_DONE:
      return [
        'Emit all partial results completed so far.',
        'Write a detailed explanation of what failed and why.',
        'Call TaskUpdate with { partial: true, escalationLevel: 5 }.',
        'Record root cause in .claude/context/memory/issues.md.',
        'Recommend specific follow-up actions for human resolution.',
        'Do NOT leave the task without emitting any output.',
      ];

    default:
      return ['Unknown level — defaulting to Level 2 (nudge).'];
  }
}

/**
 * Process escalation request from stdin or direct call.
 * @param {Object} input
 * @returns {Object} escalation result
 */
function processEscalation(input) {
  const {
    taskId = 'unknown',
    errorMessage = '',
    errorType: providedType,
    previousLevels = [],
    completedSteps = [],
    failedAt = '',
    recommendation = '',
    forceLevel,
  } = input;

  const errorType = providedType || classifyError(errorMessage);
  const level = forceLevel || getEntryLevel(errorType);

  return buildEscalationResult({
    taskId,
    level,
    errorType,
    errorMessage,
    previousLevels,
    completedSteps,
    failedAt,
    recommendation,
  });
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  const classifyOnly = args.includes('--classify');
  const nextLevel = args.includes('--next-level');
  const levelIndex = args.indexOf('--level');
  const forcedLevel = levelIndex !== -1 ? parseInt(args[levelIndex + 1], 10) : null;

  if (showHelp) {
    process.stdout.write(`
error-recovery-escalation — 5-level structured error recovery

USAGE:
  echo '<json>' | node main.cjs [OPTIONS]

OPTIONS:
  --escalate      Full escalation result (default)
  --classify      Classify error type and recommended entry level only
  --next-level    Suggest next level given previousLevels array
  --level <n>     Force entry at specific level (1-5)
  --help          Show this help

INPUT (stdin, JSON):
  {
    "taskId":        "<string>",    // required
    "errorMessage":  "<string>",    // required
    "errorType":     "<string>",    // optional (auto-classified if omitted)
    "previousLevels": [1, 2],       // optional (levels already attempted)
    "completedSteps": ["step1"],    // optional (for force-done)
    "failedAt":      "<step>",      // optional (for force-done)
    "recommendation": "<string>",   // optional (for force-done)
    "forceLevel":    <1-5>          // optional (override auto-classification)
  }

LEVELS:
  1 = retry       (transient errors)
  2 = nudge       (wrong params)
  3 = replan      (wrong approach)
  4 = fallback    (wrong agent/model)
  5 = force-done  (partial results)
`);
    process.exit(0);
  }

  let raw = '';
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    const { success, data } = safeParseJSON(raw, {});

    if (!success || !data.errorMessage) {
      process.stderr.write('[error-recovery-escalation] Missing errorMessage in input\n');
      process.exit(1);
    }

    const input = data.input || data;
    if (forcedLevel && forcedLevel >= 1 && forcedLevel <= 5) {
      input.forceLevel = forcedLevel;
    }

    try {
      if (classifyOnly) {
        const errorType = input.errorType || classifyError(input.errorMessage || '');
        const entryLevel = getEntryLevel(errorType);
        process.stdout.write(
          JSON.stringify(
            {
              errorType,
              entryLevel,
              action: LEVEL_NAMES[entryLevel],
            },
            null,
            2
          ) + '\n'
        );
      } else if (nextLevel) {
        const prevLevels = input.previousLevels || [];
        const currentMax = Math.max(0, ...prevLevels);
        const next = Math.min(currentMax + 1, LEVELS.FORCE_DONE);
        process.stdout.write(
          JSON.stringify(
            {
              nextLevel: next,
              action: LEVEL_NAMES[next],
              timeoutMs: LEVEL_TIMEOUTS_MS[next],
            },
            null,
            2
          ) + '\n'
        );
      } else {
        const result = processEscalation(input);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[error-recovery-escalation] Error: ${err.message}\n`);
      process.exit(1);
    }
  });
}

module.exports = {
  classifyError,
  getEntryLevel,
  buildEscalationResult,
  processEscalation,
  getLevelInstructions,
  LEVELS,
  LEVEL_NAMES,
  LEVEL_TIMEOUTS_MS,
  ERROR_CLASSIFICATION,
};
