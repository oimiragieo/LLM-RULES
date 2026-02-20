#!/usr/bin/env node
'use strict';
/**
 * wave-executor — Skill Entry Point
 * Validates inputs and delegates to the CLI tool.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    options[key] = value;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(`
wave-executor — Fresh-process orchestration for EPIC-tier batch pipelines

Usage:
  node main.cjs --plan <path> [--model <model>] [--dry-run] [--json]
  node main.cjs --help
`);
    process.exit(0);
  }

  const projectRoot = findProjectRoot();
  const planPath = options.plan;

  // Validate plan file exists
  if (!planPath) {
    console.error('Missing required --plan argument');
    process.exit(1);
  }

  const resolvedPlan = path.resolve(planPath);
  if (!fs.existsSync(resolvedPlan)) {
    console.error(`Plan file not found: ${resolvedPlan}`);
    process.exit(1);
  }

  // Build args for the CLI tool
  const cliTool = path.join(projectRoot, '.claude', 'tools', 'cli', 'wave-executor.mjs');
  const args = [cliTool, '--plan', resolvedPlan];

  if (options.model) args.push('--model', options.model);
  if (options['dry-run']) args.push('--dry-run');
  if (options.json) args.push('--json');
  if (options['start-from']) args.push('--start-from', options['start-from']);
  if (options['max-turns']) args.push('--max-turns', options['max-turns']);

  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });

  process.exitCode = result.status || 0;
}

main();
