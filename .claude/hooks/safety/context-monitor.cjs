'use strict';

/**
 * context-monitor.cjs — PreToolUse safety hook
 *
 * Monitors agent context window usage before each tool call and injects
 * advisory warnings when context is running dangerously low. Designed as
 * a safety guard: it fires *before* a tool executes so the agent can choose
 * to defer expensive tool calls when context is nearly full.
 *
 * Thresholds (percentage of budget used):
 *   - >= 70% used: inject WARNING additionalContext
 *   - >= 85% used: inject CRITICAL additionalContext
 *
 * Both thresholds use sentinels to avoid firing repeatedly in the same session.
 *
 * Reads token usage from .claude/context/runtime/budget-tracker.json.
 *
 * Advisory hook — always fail-open (exit 0 on any error, allow: true always).
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

/** At 70% context used, inject a warning */
const WARN_THRESHOLD_PCT = 0.7;

/** At 85% context used, inject a critical warning */
const CRITICAL_THRESHOLD_PCT = 0.85;

/** Default context budget (tokens) when not specified in tracker */
const DEFAULT_BUDGET = 200_000;

// ─── Path helpers ─────────────────────────────────────────────────────────────

function findProjectRoot() {
  // Fast path: walk up from __dirname looking for .claude/CLAUDE.md
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'CLAUDE.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback to env or cwd
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const BUDGET_TRACKER_PATH = path.join(RUNTIME_DIR, 'budget-tracker.json');
const SESSION_ID_PATH = path.join(RUNTIME_DIR, 'session-id.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safely parse JSON, returning null on any error. */
function safeParse(raw) {
  try {
    JSON.parse(raw);
    return safeParseJSON(raw, null, null, null);
  } catch (_e) {
    return null;
  }
}

/**
 * Read token usage for the current session from budget-tracker.json.
 * Returns { tokensUsed, budget, usagePct, sessionId } or null if unavailable.
 */
function readTokenUsage() {
  try {
    // Determine session ID (best-effort; fall back to 'unknown')
    let sessionId = 'unknown';
    if (fs.existsSync(SESSION_ID_PATH)) {
      const data = safeParse(fs.readFileSync(SESSION_ID_PATH, 'utf8'));
      if (data && typeof data.sessionId === 'string') {
        sessionId = data.sessionId;
      }
    }

    if (!fs.existsSync(BUDGET_TRACKER_PATH)) return null;
    const budgetData = safeParse(fs.readFileSync(BUDGET_TRACKER_PATH, 'utf8'));
    if (!budgetData || typeof budgetData !== 'object') return null;

    const entry = budgetData[sessionId];
    if (!entry || typeof entry.totalTokens !== 'number') return null;

    const tokensUsed = entry.totalTokens;
    const budget =
      typeof entry.budget === 'number' && entry.budget > 0 ? entry.budget : DEFAULT_BUDGET;
    const usagePct = tokensUsed / budget;

    return { tokensUsed, budget, usagePct, sessionId };
  } catch (_err) {
    return null;
  }
}

/**
 * Check whether a sentinel file exists for the given threshold tier.
 * Returns true if the sentinel is already set (tier already fired).
 */
function sentinelExists(tier) {
  const sentinelPath = path.join(RUNTIME_DIR, `context-monitor-${tier}.sentinel`);
  return fs.existsSync(sentinelPath);
}

/**
 * Write a sentinel file so the warning does not fire again this session.
 */
function writeSentinel(tier) {
  try {
    const sentinelPath = path.join(RUNTIME_DIR, `context-monitor-${tier}.sentinel`);
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(sentinelPath, new Date().toISOString(), 'utf8');
  } catch (_e) {
    // Non-fatal
  }
}

/**
 * Build the additionalContext warning string based on usage percentage.
 * Returns { message, tier } or null if no warning is needed.
 */
function buildWarning(usagePct, tokensUsed, budget) {
  const usedPct = Math.round(usagePct * 100);
  const remainingPct = 100 - usedPct;
  const remaining = budget - tokensUsed;

  if (usagePct >= CRITICAL_THRESHOLD_PCT && !sentinelExists('critical')) {
    writeSentinel('critical');
    return {
      tier: 'critical',
      message:
        `[CONTEXT-MONITOR] CRITICAL: Context window is ${usedPct}% full ` +
        `(${tokensUsed.toLocaleString()} / ${budget.toLocaleString()} tokens, ` +
        `~${remaining.toLocaleString()} remaining). ` +
        `Avoid spawning new agents or running expensive tools. ` +
        `Run /session-handoff IMMEDIATELY or use context-compressor to free space.`,
    };
  }

  if (usagePct >= WARN_THRESHOLD_PCT && !sentinelExists('warn')) {
    writeSentinel('warn');
    return {
      tier: 'warn',
      message:
        `[CONTEXT-MONITOR] WARNING: Context window is ${usedPct}% full ` +
        `(~${remainingPct}% remaining). ` +
        `Plan a /session-handoff before the context limit is reached.`,
    };
  }

  return null;
}

// ─── Hook entry point ─────────────────────────────────────────────────────────

/**
 * Main hook function.
 * Reads stdin for hook input (PreToolUse format), checks context usage, and
 * outputs a JSON response with optional additionalContext warning.
 */
function main() {
  const chunks = [];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    try {
      // Read token usage — fail open immediately if not available
      const usage = readTokenUsage();
      if (!usage) {
        process.stdout.write(JSON.stringify({ allow: true }));
        process.exit(0);
      }

      const { tokensUsed, budget, usagePct } = usage;
      const warning = buildWarning(usagePct, tokensUsed, budget);

      if (warning) {
        process.stdout.write(
          JSON.stringify({
            allow: true,
            additionalContext: warning.message,
          })
        );
      } else {
        process.stdout.write(JSON.stringify({ allow: true }));
      }

      process.exit(0);
    } catch (_err) {
      // Fail-open: safety hook must never block the workflow
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }
  });
}

// ─── Exports (for testing) ────────────────────────────────────────────────────

module.exports = {
  readTokenUsage,
  buildWarning,
  safeParse,
  sentinelExists,
  writeSentinel,
  WARN_THRESHOLD_PCT,
  CRITICAL_THRESHOLD_PCT,
  DEFAULT_BUDGET,
};

if (require.main === module) {
  main();
}
