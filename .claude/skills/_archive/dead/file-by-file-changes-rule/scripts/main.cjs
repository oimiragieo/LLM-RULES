#!/usr/bin/env node
/**
 * file-by-file-changes-rule - Rule-based Skill
 * Converted from: file-by-file-changes-rule.mdc
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
file-by-file-changes-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  This rule instructs the AI to make changes file by file, allowing the user to review each change individually.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for file-by-file-changes-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('file-by-file-changes-rule skill loaded. Use with Claude for code review.');
