#!/usr/bin/env node
/**
 * post-execute hook for multi-agent-architecture-reference skill
 * Records topology selection decisions to memory for audit trail.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

let input = '';
process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const parsed = safeParseJSON(input || '{}');
    const toolName = parsed.tool_name || '';

    if (toolName === 'Skill') {
      const logPath = path.resolve(
        __dirname,
        '../../../../context/runtime/multi-agent-architecture-reference-usage.jsonl'
      );
      const entry = {
        timestamp: new Date().toISOString(),
        skill: 'multi-agent-architecture-reference',
        toolInput: parsed.tool_input || {},
      };
      try {
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
      } catch {
        // Non-fatal: log directory may not exist yet
      }
    }

    process.stdout.write(JSON.stringify({ allow: true }));
  } catch {
    process.stdout.write(JSON.stringify({ allow: true }));
  }
});
