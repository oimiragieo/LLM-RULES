#!/usr/bin/env node
'use strict';

/**
 * de-sloppify CLI tool
 * Thin wrapper over the skill's main.cjs for direct CLI access.
 *
 * Usage: node .claude/tools/de-sloppify/de-sloppify.cjs [args]
 */

const path = require('path');
const { execFileSync } = require('child_process');

const mainScript = path.resolve(__dirname, '../../skills/de-sloppify/scripts/main.cjs');

try {
  execFileSync(process.execPath, [mainScript, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
  });
} catch (err) {
  process.exit(err.status || 1);
}
