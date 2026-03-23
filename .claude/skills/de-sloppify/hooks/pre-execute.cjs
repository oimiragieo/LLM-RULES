#!/usr/bin/env node
'use strict';

/**
 * de-sloppify pre-execute hook
 * Validates action enum and files array before execution.
 */

const path = require('path');
const { safeParseJSON } = require(path.resolve(__dirname, '../../../lib/utils/safe-json.cjs'));

const VALID_ACTIONS = ['find-unused-imports', 'find-console-logs', 'find-commented-code'];

let inputData = '';
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  const { success, data } = safeParseJSON(inputData, {});

  if (!success || !data || typeof data !== 'object') {
    // Cannot parse — fail open (non-security hook)
    process.exit(0);
  }

  try {
    const input = data.input || data;

    // Validate action
    if (input.action !== undefined) {
      if (!VALID_ACTIONS.includes(input.action)) {
        process.stderr.write(
          `[de-sloppify:pre-execute] Invalid action: "${input.action}". Must be one of: ${VALID_ACTIONS.join(', ')}\n`
        );
        process.exit(2);
      }
    }

    // Validate files — must be non-empty string or array
    if (input.files !== undefined) {
      const files = Array.isArray(input.files)
        ? input.files
        : String(input.files)
            .split(',')
            .map(f => f.trim())
            .filter(Boolean);

      if (files.length === 0) {
        process.stderr.write('[de-sloppify:pre-execute] --files must not be empty\n');
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (err) {
    // Unexpected error — fail open
    process.stderr.write(`[de-sloppify:pre-execute] Unexpected error: ${err.message}\n`);
    process.exit(0);
  }
});
