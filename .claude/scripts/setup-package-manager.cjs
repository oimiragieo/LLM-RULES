#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const {
  getPackageManager,
  setProjectPackageManager,
  getAvailablePackageManagers,
  getSelectionPrompt,
} = require('../lib/utils/package-manager.cjs');

const VALID_PMS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

function setGlobalPackageManager(pmName) {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.claude');
  const configPath = path.join(configDir, 'package-manager.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config = {
    packageManager: pmName,
    setAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log(`✓ Set global package manager to ${pmName}`);
  console.log(`  Config saved to: ${configPath}`);
}

function printHelp() {
  console.log(`
Usage: node .claude/scripts/setup-package-manager.cjs [command] [package-manager]

Commands:
  --detect          Show current package manager detection
  --global <pm>     Set global preference (npm|pnpm|yarn|bun)
  --project <pm>    Set project preference (npm|pnpm|yarn|bun)
  --list            List available package managers

Examples:
  node .claude/scripts/setup-package-manager.cjs --detect
  node .claude/scripts/setup-package-manager.cjs --global pnpm
  node .claude/scripts/setup-package-manager.cjs --project bun
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  if (args[0] === '--detect') {
    const pm = getPackageManager();
    console.log('\nPackage Manager Detection:');
    console.log(`  Current: ${pm.name} (${pm.source})`);
    console.log(`  Install: ${pm.config.installCmd}`);
    console.log(`  Run: ${pm.config.runCmd}`);
    console.log(`  Exec: ${pm.config.execCmd}`);
    console.log('\n' + getSelectionPrompt());
    process.exit(0);
  }

  if (args[0] === '--list') {
    const available = getAvailablePackageManagers();
    console.log('\nAvailable Package Managers:');
    available.forEach(pm => console.log(`  - ${pm}`));
    process.exit(0);
  }

  if (args[0] === '--global' && args[1]) {
    const pmName = args[1];
    if (!VALID_PMS.has(pmName)) {
      console.error(`Error: Invalid package manager: ${pmName}`);
      console.error('Valid options: npm, pnpm, yarn, bun');
      process.exit(1);
    }
    setGlobalPackageManager(pmName);
    process.exit(0);
  }

  if (args[0] === '--project' && args[1]) {
    const pmName = args[1];
    if (!VALID_PMS.has(pmName)) {
      console.error(`Error: Invalid package manager: ${pmName}`);
      console.error('Valid options: npm, pnpm, yarn, bun');
      process.exit(1);
    }
    setProjectPackageManager(pmName);
    console.log(`✓ Set project package manager to ${pmName}`);
    process.exit(0);
  }

  console.error('Error: Invalid command. Use --help for usage.');
  process.exit(1);
}

if (require.main === module) {
  main();
}
