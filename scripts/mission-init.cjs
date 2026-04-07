#!/usr/bin/env node
'use strict';

/**
 * Mission Init CLI
 *
 * Scaffolds a new Factory Droid-aligned mission bundle under .claude/missions/<uuid>/.
 *
 * Usage:
 *   node scripts/mission-init.cjs [--working-directory <path>] [--mission-id <uuid>]
 *
 * Options:
 *   --working-directory  Target code workspace path (default: current directory)
 *   --mission-id         Explicit mission UUID (default: auto-generated)
 *   --json               Output result as JSON
 */

const path = require('node:path');
const { provisionWorkspace } = require('../.claude/lib/mission/workspace-provisioner.cjs');

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--working-directory' && argv[i + 1]) {
      args.workingDirectory = argv[++i];
    } else if (argv[i] === '--mission-id' && argv[i + 1]) {
      args.missionId = argv[++i];
    } else if (argv[i] === '--json') {
      args.json = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`Usage: node scripts/mission-init.cjs [options]

Options:
  --working-directory <path>  Target code workspace (default: cwd)
  --mission-id <uuid>         Explicit mission UUID (default: auto)
  --json                      Output as JSON
  --help                      Show this help`);
      process.exit(0);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  // Default rootPath to .claude/ inside the project
  const rootPath = path.resolve(process.cwd(), '.claude');
  const workingDirectory = args.workingDirectory || process.cwd();

  try {
    const result = provisionWorkspace({
      rootPath,
      missionId: args.missionId,
      workingDirectory,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Mission initialized successfully.`);
      console.log(`  ID:        ${result.missionId}`);
      console.log(`  Path:      ${result.workspacePath}`);
      console.log(`  Created:   ${result.createdAt}`);
      console.log(`  Target:    ${workingDirectory}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Edit mission.md with objectives and milestones');
      console.log('  2. Add features to features.json');
      console.log('  3. Define VAL-* assertions in validation-contract.md');
      console.log('  4. Set coding rules in AGENTS.md');
    }
  } catch (err) {
    if (err.code === 'WORKSPACE_EXISTS') {
      console.error(`Error: Mission workspace already exists: ${err.details.workspacePath}`);
      process.exit(1);
    }
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
