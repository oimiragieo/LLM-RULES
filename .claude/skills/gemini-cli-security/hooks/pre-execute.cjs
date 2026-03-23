'use strict';

/**
 * gemini-cli-security - Pre-execution hook
 *
 * Validates inputs before security scan execution.
 * Checks target path existence and argument validity.
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

/**
 * PreToolUse hook entry point (stdin/stdout JSON protocol)
 */
function preExecute(input) {
  try {
    const args = input.args || {};
    const target = args.target || '.';

    // Validate target path if explicitly set
    if (args.target) {
      const absTarget = path.resolve(process.cwd(), args.target);
      if (!fs.existsSync(absTarget)) {
        return {
          allow: false,
          message: `[gemini-cli-security] Target path does not exist: ${absTarget}`,
        };
      }
    }

    // Validate scan-deps requires package.json in target
    if (args.scanDeps) {
      const pkgPath = path.join(path.resolve(process.cwd(), target), 'package.json');
      if (!fs.existsSync(pkgPath)) {
        // Non-blocking: just warn (dependency scan will degrade gracefully)
        process.stderr.write(
          `[gemini-cli-security] Warning: --scan-deps requested but no package.json found at ${pkgPath}\n`
        );
      }
    }

    // Log execution start
    process.stderr.write(
      `[gemini-cli-security] Pre-execute: target=${target}, scanDeps=${!!args.scanDeps}, json=${!!args.json}\n`
    );

    return { allow: true };
  } catch (err) {
    // Graceful degradation: allow execution even if hook fails
    process.stderr.write(
      `[gemini-cli-security] Pre-execute hook error (non-fatal): ${err.message}\n`
    );
    return { allow: true };
  }
}

// Support both stdin protocol and direct invocation
if (require.main === module) {
  let input = '';
  process.stdin.on('data', chunk => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const parsed = input.trim() ? safeParseJSON(input) : {};
      const result = preExecute(parsed);
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch {
      // Allow on parse failure
      process.stdout.write(JSON.stringify({ allow: true }) + '\n');
    }
  });
} else {
  module.exports = { preExecute };
}
