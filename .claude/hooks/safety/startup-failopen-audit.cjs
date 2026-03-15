#!/usr/bin/env node
/**
 * startup-failopen-audit.cjs — UserPromptSubmit advisory hook (SEC-003)
 * ========================================================================
 *
 * Warns (via stderr, exit 0) if any *_FAIL_OPEN environment variables are
 * set to "true". These variables loosen security enforcement and should only
 * be enabled intentionally during debugging, never in production.
 *
 * Advisory only — never blocks. Exits 0 always.
 *
 * Environment variables checked (pattern: *_FAIL_OPEN=true):
 *   EXTERNAL_CONTENT_GUARD_FAIL_OPEN
 *   HOOK_FAIL_OPEN
 *   SPAWN_PROMPT_VALIDATOR_FAIL_OPEN
 *   CREATOR_GUARD_FAIL_OPEN
 *   ROUTING_GUARD_FAIL_OPEN
 *   BASH_VALIDATOR_FAIL_OPEN
 *   SHELL_INJECTION_FAIL_OPEN
 *   (plus any other key matching /_FAIL_OPEN$/)
 */

'use strict';

function getFailOpenVars() {
  return Object.entries(process.env)
    .filter(([key, val]) => /_FAIL_OPEN$/.test(key) && val === 'true')
    .map(([key]) => key);
}

function main() {
  try {
    const failOpenVars = getFailOpenVars();

    if (failOpenVars.length > 0) {
      process.stderr.write(
        `[startup-failopen-audit] WARNING: ${failOpenVars.length} security fail-open override(s) active: ` +
          failOpenVars.join(', ') +
          '. Security enforcement is weakened. Unset these variables when not debugging.\n'
      );
    }

    // Advisory only — always exit 0
    process.exit(0);
  } catch (_err) {
    // Never block on errors
    process.exit(0);
  }
}

main();

module.exports = { getFailOpenVars, main };
