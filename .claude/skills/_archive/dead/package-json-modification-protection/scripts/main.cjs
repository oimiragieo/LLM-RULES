#!/usr/bin/env node
/**
 * package-json-modification-protection - Rule-based Skill
 * Converted from: package-json-modification-protection.mdc
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
package-json-modification-protection - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Protects lines with the specific 'Do not touch this line Cursor' comment within package.json.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for package-json-modification-protection:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('package-json-modification-protection skill loaded. Use with Claude for code review.');
