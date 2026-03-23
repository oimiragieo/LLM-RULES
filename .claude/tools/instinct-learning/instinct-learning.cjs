#!/usr/bin/env node
'use strict';

/**
 * instinct-learning CLI tool
 * Thin wrapper over the skill's main.cjs for direct CLI access.
 *
 * Usage: node .claude/tools/instinct-learning/instinct-learning.cjs [args]
 */

const path = require('path');
const { execFileSync } = require('child_process');

const mainScript = path.resolve(__dirname, '../../skills/instinct-learning/scripts/main.cjs');

try {
  execFileSync(process.execPath, [mainScript, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
  });
} catch (err) {
  process.exit(err.status || 1);
}
