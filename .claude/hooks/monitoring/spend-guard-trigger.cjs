#!/usr/bin/env node
'use strict';

/**
 * spend-guard-trigger.cjs — PostToolUse advisory hook
 *
 * Checks per-session spend ceiling after every tool call and emits a
 * downgrade-to-haiku hint when the configured ceiling is reached.
 * Solves Reddit pain #5 (cost unpredictability).
 *
 * Calls: checkSpendCeiling() from token-governor.cjs
 *
 * Registration: settings.json PostToolUse (matcher: ""), async: true
 *
 * Exit codes: always 0 — this is an advisory/fail-open hook.
 *   Never blocks tool execution regardless of spend level.
 *
 * Kill switch: set SPEND_GUARD=off to suppress all checks.
 *
 * Environment variables forwarded to checkSpendCeiling:
 *   SPEND_GUARD_CEILING_USD     — ceiling in USD (default $5.00/session)
 *   SPEND_GUARD_STATUS_FILE     — override path to ccusage-status.txt
 *   SPEND_GUARD_OVERRIDE_FILE   — override path to spend-guard-override.json
 *
 * @module spend-guard-trigger
 */

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Imports ──────────────────────────────────────────────────────────────────

const { parseHookInputAsync } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'hook-input.cjs')
);

const { checkSpendCeiling } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'token-governor.cjs')
);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Kill switch — bail immediately if disabled
  if ((process.env.SPEND_GUARD || '').toLowerCase() === 'off') {
    process.stdout.write(JSON.stringify({ allow: true }) + '\n');
    process.exit(0);
  }

  let hookInput = null;

  try {
    hookInput = await parseHookInputAsync();
  } catch (_err) {
    // Fail-open: malformed stdin must not crash the hook
  }

  const safeInput = hookInput || {};

  try {
    const sessionId = safeInput.session_id || 'default';
    const result = checkSpendCeiling(sessionId);

    if (result.downgrade) {
      const costStr =
        typeof result.sessionCostUsd === 'number'
          ? `$${result.sessionCostUsd.toFixed(2)}`
          : '(unknown)';
      const ceilingStr =
        typeof result.ceilingUsd === 'number' ? `$${result.ceilingUsd.toFixed(2)}` : '(unknown)';

      const advisory =
        `[spend-guard] Session cost ${costStr} exceeds ceiling ${ceilingStr}. ` +
        `Downgrading next spawn to haiku. ` +
        `See .claude/context/runtime/spend-guard-override.json`;

      process.stderr.write(`[spend-guard] ADVISORY: ${advisory}\n`);

      process.stdout.write(JSON.stringify({ allow: true, additionalContext: advisory }) + '\n');
      process.exit(0);
    }
  } catch (_err) {
    // Fail-open: never block the tool call due to an internal error
  }

  process.stdout.write(JSON.stringify({ allow: true }) + '\n');
  process.exit(0);
}

main();
