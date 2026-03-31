#!/usr/bin/env node
/**
 * @file startup-failopen-audit.cjs
 * @hook-type UserPromptSubmit
 * @description SEC-003: Warn at session start when fail-open env var overrides are active.
 *
 * This hook runs on every prompt submission and emits a stderr warning when any
 * _FAIL_OPEN=true environment variables are detected. These overrides soften
 * security hooks from fail-closed to fail-open and should never be silently active.
 *
 * Exit: always 0 (advisory only — never blocks).
 */

'use strict';

const HOOK_NAME = 'startup-failopen-audit';

function main() {
  const failOpenVars = Object.entries(process.env)
    .filter(([k, v]) => k.endsWith('_FAIL_OPEN') && v === 'true')
    .map(([k]) => k);

  if (failOpenVars.length > 0) {
    process.stderr.write(
      `[${HOOK_NAME}] WARNING: ${failOpenVars.length} fail-open override(s) active: ${failOpenVars.join(', ')}\n`
    );
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}
