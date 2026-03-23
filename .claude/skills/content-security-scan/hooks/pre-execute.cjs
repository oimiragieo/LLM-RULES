'use strict';
/**
 * content-security-scan: pre-execute.cjs
 * Pre-execution hook: validates that source_url is provided before running scan.
 * Agent: developer | Task: #9 | Session: 2026-02-20
 */

const input = safeParseJSON(require('fs').readFileSync('/dev/stdin', 'utf8'));
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
// Note: safeParseJSON import is above, used for stdin parsing on line 8

const { tool_name, tool_input } = input || {};

// Only intercept skill invocations for content-security-scan
if (tool_name !== 'Skill' || (tool_input && tool_input.skill !== 'content-security-scan')) {
  process.stdout.write(JSON.stringify({ allow: true }) + '\n');
  process.exit(0);
}

const args = tool_input ? tool_input.args || '' : '';

if (!args || args.trim().length === 0) {
  process.stdout.write(
    JSON.stringify({
      allow: false,
      message:
        'content-security-scan requires arguments: <content-or-file> <source_url>. Example: Skill({ skill: "content-security-scan", args: "<content> <url>" })',
    }) + '\n'
  );
  process.exit(2);
}

process.stdout.write(JSON.stringify({ allow: true }) + '\n');
process.exit(0);
