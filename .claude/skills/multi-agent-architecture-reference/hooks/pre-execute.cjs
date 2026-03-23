#!/usr/bin/env node
/**
 * pre-execute hook for multi-agent-architecture-reference skill
 * Validates that the caller has provided necessary context for topology selection.
 */

'use strict';
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

let input = '';
process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const parsed = safeParseJSON(input || '{}');
    const toolName = parsed.tool_name || '';

    // Allow all tool calls through; just emit advisory if context looks thin
    if (toolName === 'Skill') {
      const skillArgs = parsed.tool_input || {};
      const hasArgs = skillArgs.args && skillArgs.args.trim().length > 0;
      if (!hasArgs) {
        process.stderr.write(
          '[multi-agent-architecture-reference] Tip: Pass task description as args for topology recommendation\n'
        );
      }
    }

    process.stdout.write(JSON.stringify({ allow: true }));
  } catch {
    process.stdout.write(JSON.stringify({ allow: true }));
  }
});
