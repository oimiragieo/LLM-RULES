#!/usr/bin/env node
/**
 * private-vs-shared-components - Rule-based Skill
 * Converted from: private-vs-shared-components.mdc
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

if (options.help) {
  console.log(`
private-vs-shared-components - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Rules for determining if a component should be private or shared, and where to place them based on their use-case.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for private-vs-shared-components:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('private-vs-shared-components skill loaded. Use with Claude for code review.');
