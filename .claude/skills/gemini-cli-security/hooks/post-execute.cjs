'use strict';

/**
 * gemini-cli-security - Post-execution hook
 *
 * Records metrics and outcomes after security scan execution.
 * Logs findings count, severity breakdown, and execution duration.
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

/**
 * PostToolUse hook entry point (stdin/stdout JSON protocol)
 */
function postExecute(input) {
  try {
    const result = input.result || {};
    const args = input.args || {};

    // Parse findings from JSON output if available
    let findingsCount = 0;
    let criticalCount = 0;
    let highCount = 0;

    if (result.output && args.json) {
      try {
        const parsed = safeParseJSON(result.output);
        if (parsed.summary) {
          findingsCount =
            (parsed.summary.critical || 0) +
            (parsed.summary.high || 0) +
            (parsed.summary.medium || 0) +
            (parsed.summary.low || 0);
          criticalCount = parsed.summary.critical || 0;
          highCount = parsed.summary.high || 0;
        }
      } catch {
        // Non-JSON output, skip parsing
      }
    }

    // Log metrics to stderr
    process.stderr.write(
      `[gemini-cli-security] Post-execute: findings=${findingsCount}, critical=${criticalCount}, high=${highCount}\n`
    );

    // Append to metrics log if directory exists
    const metricsDir = path.join(process.cwd(), '.claude', 'context', 'tmp');
    if (fs.existsSync(metricsDir)) {
      const metricsPath = path.join(metricsDir, 'gemini-cli-security-metrics.jsonl');
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        target: args.target || '.',
        findings: findingsCount,
        critical: criticalCount,
        high: highCount,
        exitCode: result.exitCode || 0,
      });
      fs.appendFileSync(metricsPath, entry + '\n');
    }

    return { allow: true };
  } catch (err) {
    // Graceful degradation
    process.stderr.write(
      `[gemini-cli-security] Post-execute hook error (non-fatal): ${err.message}\n`
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
      const result = postExecute(parsed);
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch {
      process.stdout.write(JSON.stringify({ allow: true }) + '\n');
    }
  });
} else {
  module.exports = { postExecute };
}
