#!/usr/bin/env node
'use strict';

/**
 * Mission Init CLI
 *
 * Scaffolds a new Factory Droid-aligned mission bundle.
 * Usage: node scripts/mission/mission-init.cjs [--root <path>] [--working-dir <path>]
 */

const path = require('node:path');
const { provisionWorkspace } = require(
  path.join(__dirname, '..', '..', '.claude', 'lib', 'mission', 'workspace-provisioner.cjs')
);

const args = process.argv.slice(2);
const rootPath = getArg(args, '--root') || path.join(process.cwd(), '.claude', 'missions');
const workingDirectory = getArg(args, '--working-dir') || process.cwd();

function getArg(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
}

try {
  const result = provisionWorkspace({ rootPath, workingDirectory });
  console.log(`Mission initialized: ${result.missionId}`);
  console.log(`Workspace: ${result.workspacePath}`);
  console.log(`Created: ${result.createdAt}`);
  console.log('\nNext steps:');
  console.log('  1. Edit mission.md with objectives');
  console.log('  2. Add features to features.json');
  console.log('  3. Define VAL-* assertions in validation-contract.md');
  console.log('  4. Run: pnpm mission:validate ' + result.missionId);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
