#!/usr/bin/env node
/**
 * Ensure Routing Prototypes
 *
 * If .claude/config/routing-prototypes.json is missing, run the generator
 * so semantic routing works after pnpm install / npm install without manual steps.
 *
 * Used by: package.json postinstall
 * Run manually: node .claude/scripts/ensure-routing-prototypes.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');

const PROTOTYPES_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'routing-prototypes.json');
const GENERATOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'generate-routing-prototypes.cjs'
);

function main() {
  if (fs.existsSync(PROTOTYPES_PATH)) {
    return 0;
  }

  const result = spawnSync(process.execPath, [GENERATOR_PATH], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });

  return result.status !== undefined ? result.status : result.signal ? 1 : 0;
}

process.exit(main());
