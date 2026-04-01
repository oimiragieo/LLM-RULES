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
 * Also includes:
 *   - Microcompact detector: detects silent token drops >10K without a PreCompact event
 *   - Circuit breaker detector: fires after 3 consecutive turns at >=93% usage
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
const { record } = require('../../lib/monitoring/flight-recorder.cjs');

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

// ─── Detector constants ───────────────────────────────────────────────────────

/**
 * Circuit breaker threshold: 93% aligns with CC's auto-compact at ~93.5%
 * (contextWindow - 13K for a 200K window).
 */
const CIRCUIT_BREAKER_THRESHOLD_PCT = 0.93;

/** Number of consecutive turns at >= CIRCUIT_BREAKER_THRESHOLD_PCT before tripping */
const CIRCUIT_BREAKER_TURNS = 3;

/** Minimum token drop to classify as a microcompact event */
const MICROCOMPACT_DROP_TOKENS = 10_000;

/** Maximum age (ms) of a pre-compact snapshot to be considered "fresh" (prevents false positives) */
const SNAPSHOT_FRESHNESS_MS = 30_000;

// ─── File paths ───────────────────────────────────────────────────────────────

const RUNTIME_DIR = path.join(__dirname, '..', '..', 'context', 'runtime');

/**
 * Allow env-var overrides for all paths so tests can inject temp-directory fixtures
 * without touching the real runtime directory.
 */
const BUDGET_TRACKER_PATH =
  process.env.BUDGET_TRACKER_PATH || path.join(RUNTIME_DIR, 'budget-tracker.json');
const SESSION_ID_PATH = process.env.SESSION_ID_PATH || path.join(RUNTIME_DIR, 'session-id.json');
const MONITOR_STATE_FILE =
  process.env.CONTEXT_MONITOR_STATE_FILE || path.join(RUNTIME_DIR, 'context-monitor-state.json');

/** Mutable — overridable by tests via _setSnapshotPath() */
let _snapshotFilePath =
  process.env.PRE_COMPACT_SNAPSHOT_FILE || path.join(RUNTIME_DIR, 'pre-compact-snapshot.json');

// ─── Module-level detector state ─────────────────────────────────────────────

/** Last observed token count — used by microcompact detector across turns */
let _previousTokensUsed = null;

/** Consecutive turns at >=93% usage — used by circuit breaker */
let _consecutiveHighUsageTurns = 0;

/** Guards against double-loading state from file in the same process */
let _stateLoaded = false;

// ─── State persistence ────────────────────────────────────────────────────────

/**
 * Load persisted detector state from disk (once per process).
 * Fail-open: errors leave state at in-memory defaults.
 */
function loadMonitorState() {
  if (_stateLoaded) return;
  _stateLoaded = true;
  try {
    if (!fs.existsSync(MONITOR_STATE_FILE)) return;
    const raw = fs.readFileSync(MONITOR_STATE_FILE, 'utf8');
    const data = safeParseJSON(raw, null);
    if (!data || typeof data !== 'object') return;
    if (typeof data.previousTokensUsed === 'number') {
      _previousTokensUsed = data.previousTokensUsed;
    }
    if (typeof data.consecutiveHighUsageTurns === 'number') {
      _consecutiveHighUsageTurns = data.consecutiveHighUsageTurns;
    }
  } catch (_err) {
    // fail-open
  }
}

/**
 * Persist current detector state to disk.
 * Fail-open: errors are silently swallowed.
 */
function saveMonitorState() {
  try {
    fs.writeFileSync(
      MONITOR_STATE_FILE,
      JSON.stringify({
        previousTokensUsed: _previousTokensUsed,
        consecutiveHighUsageTurns: _consecutiveHighUsageTurns,
      }),
      'utf8'
    );
  } catch (_err) {
    // fail-open
  }
}

// ─── Snapshot freshness check ─────────────────────────────────────────────────

/**
 * Return true when a pre-compact snapshot was written within the last 30 seconds.
 * This indicates a normal (non-silent) compaction just occurred.
 */
function isSnapshotFresh() {
  try {
    if (!fs.existsSync(_snapshotFilePath)) return false;
    const raw = fs.readFileSync(_snapshotFilePath, 'utf8');
    const data = safeParseJSON(raw, null);
    if (!data || typeof data.timestamp !== 'string') return false;
    const age = Date.now() - new Date(data.timestamp).getTime();
    return age < SNAPSHOT_FRESHNESS_MS;
  } catch (_err) {
    return false;
  }
}

// ─── Microcompact detection ───────────────────────────────────────────────────

/**
 * Detect a microcompact: a silent token-count drop >10K that was NOT preceded
 * by a PreCompact hook firing (inferred by absence of a fresh snapshot file).
 *
 * Updates the module-level previousTokensUsed state.
 * Logs a `microcompact-detected` event to the flight recorder when detected.
 * Fail-open: any error returns { detected: false, drop: 0 }.
 *
 * @param {number} tokensUsed - Current token count for this turn
 * @returns {{ detected: boolean, drop: number }}
 */
function checkMicrocompact(tokensUsed) {
  try {
    const prev = _previousTokensUsed;
    _previousTokensUsed = tokensUsed;

    if (prev === null) {
      return { detected: false, drop: 0 };
    }

    const drop = prev - tokensUsed;
    if (drop > MICROCOMPACT_DROP_TOKENS && !isSnapshotFresh()) {
      try {
        record({
          event: 'microcompact-detected',
          component: 'context-window-monitor',
          drop,
          previousTokensUsed: prev,
          currentTokensUsed: tokensUsed,
        });
      } catch (_flightErr) {
        // fail-open — flight recorder errors must not break the hook
      }
      return { detected: true, drop };
    }

    return { detected: false, drop: Math.max(0, drop) };
  } catch (_err) {
    return { detected: false, drop: 0 };
  }
}

// ─── Circuit breaker detection ────────────────────────────────────────────────

/**
 * Track consecutive turns at >=93% context usage. After 3 consecutive turns,
 * log a `circuit-breaker-tripped` event and return an actionable advisory string.
 * The counter resets whenever usage drops below 93%.
 *
 * Fail-open: any error returns null (no advisory).
 *
 * @param {number} usagePct - Current usage as a fraction in [0, 1]
 * @returns {string|null} Advisory message when breaker trips, otherwise null
 */
function checkCircuitBreaker(usagePct) {
  try {
    if (usagePct >= CIRCUIT_BREAKER_THRESHOLD_PCT) {
      _consecutiveHighUsageTurns++;
    } else {
      _consecutiveHighUsageTurns = 0;
    }

    if (_consecutiveHighUsageTurns >= CIRCUIT_BREAKER_TURNS) {
      try {
        record({
          event: 'circuit-breaker-tripped',
          component: 'context-window-monitor',
          consecutiveTurns: _consecutiveHighUsageTurns,
          usagePct,
        });
      } catch (_flightErr) {
        // fail-open
      }
      return (
        `CIRCUIT BREAKER: Context has been at \u226593% usage for ` +
        `${_consecutiveHighUsageTurns} consecutive turns. ` +
        `Initiate /session-handoff immediately or run context-compressor ` +
        `to prevent spawn failures. Consider spawning a fresh agent to continue.`
      );
    }

    return null;
  } catch (_err) {
    return null;
  }
}

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

// Export for programmatic use by consolidated bundles and tests
module.exports = {
  readTokenUsage,
  buildWarningMessage,
  checkMicrocompact,
  checkCircuitBreaker,
  // Test helpers — reset module-level state between tests
  _resetState() {
    _previousTokensUsed = null;
    _consecutiveHighUsageTurns = 0;
    _stateLoaded = false;
  },
  _setSnapshotPath(p) {
    _snapshotFilePath = p;
  },
};

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

      // Load persisted detector state from previous turns (fail-open)
      loadMonitorState();

      // Read token usage
      const usage = readTokenUsage();

      if (!usage) {
        // No metrics available — save state and allow without warning
        saveMonitorState();
        process.stdout.write(JSON.stringify({ allow: true }));
        process.exit(0);
        return;
      }

      const { tokensUsed, budget, usagePct } = usage;

      // Run detectors (both fail-open; state updated as side effect)
      checkMicrocompact(tokensUsed);
      const circuitBreakerAdvisory = checkCircuitBreaker(usagePct);

      // Persist updated state for the next turn
      saveMonitorState();

      // Build threshold warning message (null if below warning level)
      const warningMessage = buildWarningMessage(usagePct, tokensUsed, budget);

      // Combine threshold warning + circuit breaker advisory (either or both may be present)
      const parts = [warningMessage, circuitBreakerAdvisory].filter(Boolean);

      if (parts.length > 0) {
        process.stdout.write(
          JSON.stringify({
            allow: true,
            additionalContext: parts.join('\n\n'),
          })
        );
      } else {
        process.stdout.write(JSON.stringify({ allow: true }));
      }

      process.exit(0);
    } catch (_err) {
      // Fail-open: advisory hook must never break workflow
      saveMonitorState();
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }
  });
}

if (require.main === module) {
  main();
}
