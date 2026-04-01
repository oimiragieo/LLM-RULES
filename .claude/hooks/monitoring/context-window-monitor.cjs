'use strict';

/**
 * context-window-monitor.cjs — PostToolUse hook
 *
 * Monitors agent context window usage and injects advisory warnings when
 * context is running low. Modelled after GSD context-monitor.md.
 *
 * Thresholds (percentage of budget used) — aligned with SKILL.md severity zones
 * and Claude Code's auto-compact constant (contextWindow - 13K = ~93.5% for 200K):
 *   - >= 65% used: inject WARNING additionalContext  (Yellow zone start)
 *   - >= 90% used: inject CRITICAL additionalContext (Critical zone start, 90–93%)
 *
 * Reads token usage from .claude/context/runtime/budget-tracker.json
 * and the current session ID from .claude/context/runtime/session-id.json.
 *
 * Advisory hook — always fail-open (exit 0 on any error).
 * Uses safeParseJSON for all JSON parsing (SE-02 prototype pollution protection).
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ─── Threshold constants ─────────────────────────────────────────────────────

/** At 65% context used, inject a warning (Yellow zone start per context-degradation SKILL.md) */
const WARN_THRESHOLD_PCT = 0.65;

/**
 * At 90% context used, inject a critical warning (Critical zone start per context-degradation SKILL.md).
 * Claude Code auto-compact fires at ~93.5% (contextWindow - 13K for a 200K window).
 */
const CRITICAL_THRESHOLD_PCT = 0.9;

/** Default context window budget (tokens) used if budget not in tracker */
const DEFAULT_BUDGET = 200_000;

// ─── File paths ───────────────────────────────────────────────────────────────

const RUNTIME_DIR = path.join(__dirname, '..', '..', 'context', 'runtime');
const BUDGET_TRACKER_PATH = path.join(RUNTIME_DIR, 'budget-tracker.json');
const SESSION_ID_PATH = path.join(RUNTIME_DIR, 'session-id.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read token usage for the current session.
 * Returns { tokensUsed, budget, usagePct } or null if unavailable.
 */
function readTokenUsage() {
  try {
    // Read session ID
    if (!fs.existsSync(SESSION_ID_PATH)) {
      return null;
    }
    const sessionRaw = fs.readFileSync(SESSION_ID_PATH, 'utf8');
    const sessionData = safeParseJSON(sessionRaw, null);
    const sessionId =
      sessionData && typeof sessionData.sessionId === 'string' ? sessionData.sessionId : null;

    if (!sessionId) {
      return null;
    }

    // Read budget tracker
    if (!fs.existsSync(BUDGET_TRACKER_PATH)) {
      return null;
    }
    const budgetRaw = fs.readFileSync(BUDGET_TRACKER_PATH, 'utf8');
    const budgetData = safeParseJSON(budgetRaw, null);

    if (!budgetData || typeof budgetData !== 'object') {
      return null;
    }

    const entry = budgetData[sessionId];
    if (!entry || typeof entry.totalTokens !== 'number') {
      return null;
    }

    const tokensUsed = entry.totalTokens;
    const budget =
      typeof entry.budget === 'number' && entry.budget > 0 ? entry.budget : DEFAULT_BUDGET;
    const usagePct = tokensUsed / budget;

    return { tokensUsed, budget, usagePct };
  } catch (_err) {
    return null;
  }
}

/**
 * Build the additionalContext warning message based on usage percentage.
 * Returns null if no warning needed.
 */
function buildWarningMessage(usagePct, tokensUsed, budget) {
  const remainingPct = Math.round((1 - usagePct) * 100);
  const usedPct = Math.round(usagePct * 100);

  if (usagePct >= CRITICAL_THRESHOLD_PCT) {
    return (
      `CRITICAL: Context window is ${usedPct}% full (${tokensUsed.toLocaleString()} / ${budget.toLocaleString()} tokens). ` +
      `Only ~${remainingPct}% remaining. ` +
      `Run context-compressor IMMEDIATELY or initiate a session handoff via /session-handoff. ` +
      `New agent spawns may fail without compression.`
    );
  }

  if (usagePct >= WARN_THRESHOLD_PCT) {
    return (
      `WARNING: Context window is ${usedPct}% full (${tokensUsed.toLocaleString()} / ${budget.toLocaleString()} tokens). ` +
      `Only ~${remainingPct}% remaining. ` +
      `Consider running context-compressor or planning a session handoff soon.`
    );
  }

  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Export for programmatic use by consolidated bundles
module.exports = { readTokenUsage, buildWarningMessage };

function main() {
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    try {
      const rawInput = Buffer.isBuffer(chunks[0])
        ? Buffer.concat(chunks).toString('utf8')
        : chunks.join('');

      // Parse input — fail-open on invalid JSON
      const input = safeParseJSON(rawInput, null);

      if (!input || typeof input !== 'object') {
        // Malformed or non-object stdin — fail open
        process.stdout.write(JSON.stringify({ allow: true }));
        process.exit(0);
        return;
      }

      // Read token usage
      const usage = readTokenUsage();

      if (!usage) {
        // No metrics available — allow without warning
        process.stdout.write(JSON.stringify({ allow: true }));
        process.exit(0);
        return;
      }

      const { tokensUsed, budget, usagePct } = usage;
      const warningMessage = buildWarningMessage(usagePct, tokensUsed, budget);

      if (warningMessage) {
        process.stdout.write(
          JSON.stringify({
            allow: true,
            additionalContext: warningMessage,
          })
        );
      } else {
        process.stdout.write(JSON.stringify({ allow: true }));
      }

      process.exit(0);
    } catch (_err) {
      // Fail-open: advisory hook must never break workflow
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }
  });
}

if (require.main === module) {
  main();
}
