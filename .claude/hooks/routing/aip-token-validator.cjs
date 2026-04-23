'use strict';
// <!-- Agent: security-architect | Task: #S3-aip-tokens | Session: 2026-04-20 -->

/**
 * aip-token-validator.cjs — SubagentStart (or PreToolUse Task) hook
 *
 * AIP Invocation-Bound Capability Token Validator
 * Per arXiv 2603.24775 — validates the token injected by aip-token-injector.cjs.
 *
 * Behaviour:
 * - Reads the Task() input for _aip_token and subagent_type
 * - Verifies the token: signature, expiry, delegatee, and a representative capability
 * - In production mode (AIP_TOKENS != 'off'): blocks Task() if token is missing or invalid
 * - Escape hatch: AIP_TOKENS=off → pass-through (always allow)
 * - Logs validation result to stderr for observability
 *
 * Security posture: ENFORCEMENT (fail-closed for invalid tokens in production mode)
 * BC-3: Task() spawns require a valid capability token in production mode.
 *
 * Integration:
 * - Runs AFTER aip-token-injector.cjs in the PreToolUse(Task) hook chain
 * - The injector adds _aip_token; this validator checks it
 */

const { verifyToken } = require('../../lib/aip/capability-tokens.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Representative capability checked during validation.
// We verify 'Read' as the minimum capability any agent should have.
const REPRESENTATIVE_CAPABILITY = 'Read';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const input = safeParseJSON(Buffer.concat(chunks).toString());
    const toolName = input?.tool_name || '';

    // Only validate Task() calls
    if (toolName !== 'Task') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Escape hatch: AIP_TOKENS=off → always allow (verifyToken also respects this,
    // but we short-circuit here to skip the missing-token block check)
    if ((process.env.AIP_TOKENS || '').toLowerCase() === 'off') {
      process.stdout.write(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    const subagentType = input?.tool_input?.subagent_type || '';
    const token = input?.tool_input?._aip_token || '';

    // Token missing — BC-3: block in production mode
    if (!token) {
      const msg =
        `[aip-token-validator] BLOCKED: Task(${subagentType}) missing _aip_token. ` +
        'Set AIP_TOKENS=off to disable capability token enforcement (dev/test only).';
      process.stderr.write(`${msg}\n`);
      process.stdout.write(
        JSON.stringify({
          allow: false,
          message: msg,
        })
      );
      process.exit(2);
    }

    // Verify the token
    const valid = verifyToken(token, subagentType, REPRESENTATIVE_CAPABILITY);

    if (!valid) {
      const msg =
        `[aip-token-validator] BLOCKED: Task(${subagentType}) has invalid/expired AIP token. ` +
        'Token failed signature, expiry, delegatee, or capability check.';
      process.stderr.write(`${msg}\n`);
      process.stdout.write(
        JSON.stringify({
          allow: false,
          message: msg,
        })
      );
      process.exit(2);
    }

    process.stderr.write(`[aip-token-validator] PASSED: Task(${subagentType}) token verified OK\n`);
    process.stdout.write(JSON.stringify({ allow: true }));
    process.exit(0);
  } catch (err) {
    // Unexpected error — fail closed (security hook policy)
    const msg = `[aip-token-validator] ERROR: ${err.message} — failing closed`;
    process.stderr.write(`${msg}\n`);
    process.stdout.write(
      JSON.stringify({
        allow: false,
        message: msg,
      })
    );
    process.exit(2);
  }
});
