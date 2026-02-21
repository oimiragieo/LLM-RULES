#!/usr/bin/env node
/**
 * multi-agent-architecture-reference — companion CLI tool
 *
 * Thin wrapper around the skill's main.cjs script.
 * Provides topology selection reference from the command line.
 *
 * Usage:
 *   node .claude/tools/multi-agent-architecture-reference/multi-agent-architecture-reference.cjs [--list] [--topology <name>] [--failure-modes]
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const mainScript = path.join(
  PROJECT_ROOT,
  '.claude/skills/multi-agent-architecture-reference/scripts/main.cjs'
);

const result = spawnSync(process.execPath, [mainScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: PROJECT_ROOT,
  shell: false,
});

process.exit(result.status || 0);
