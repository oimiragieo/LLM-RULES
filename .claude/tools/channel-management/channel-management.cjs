#!/usr/bin/env node
'use strict';

/**
 * channel-management.cjs — CLI companion tool for the channel-management skill.
 *
 * Thin wrapper that delegates to the skill's main.cjs script.
 * Provides a stable entry point at .claude/tools/channel-management/channel-management.cjs
 *
 * Usage:
 *   node .claude/tools/channel-management/channel-management.cjs [start|stop|status|health]
 */

const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_MAIN = path.resolve(__dirname, '../../skills/channel-management/scripts/main.cjs');
const action = process.argv[2] || 'status';

const result = spawnSync(process.execPath, [SKILL_MAIN, action, '--json'], {
  shell: false,
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(result.status || 0);
