'use strict';

/**
 * Context Window Hard Guards (80K / 120K / 150K token thresholds)
 *
 * Emits structured stderr warnings when token budget crosses documented
 * thresholds from CLAUDE.md Section 8. Advisory only — does NOT block execution.
 *
 * @see {@link file://../../../.claude/CLAUDE.md} Section 8 — Context Window Budget
 */

const CTX_WARN_TOKENS = 80_000;
const CTX_CRITICAL_TOKENS = 120_000;
const CTX_RED_LINE_TOKENS = 150_000;

/**
 * @param {object} hookInput - Parsed hook input
 */
function emitContextWindowWarning(hookInput) {
  try {
    const budget = hookInput && hookInput.token_budget;
    if (!budget) return;

    const used = Number(budget.used_tokens) || 0;
    if (used < CTX_WARN_TOKENS) return;

    let level, label;
    if (used >= CTX_RED_LINE_TOKENS) {
      level = 'RED_LINE';
      label = `RED LINE (${used.toLocaleString()} tokens): No new agent spawns until compression completes`;
    } else if (used >= CTX_CRITICAL_TOKENS) {
      level = 'CRITICAL';
      label = `CRITICAL (${used.toLocaleString()} tokens): Compression mandatory before new spawns`;
    } else {
      level = 'WARN';
      label = `WARN (${used.toLocaleString()} tokens): Approaching context limit — spawn context-compressor proactively`;
    }

    process.stderr.write(
      JSON.stringify({
        hook: 'context-window-guard',
        event: 'context_window_guard',
        level,
        usedTokens: used,
        message: label,
        timestamp: new Date().toISOString(),
      }) + '\n'
    );
  } catch (_err) {
    // Best-effort; never block
  }
}

module.exports = { emitContextWindowWarning };
