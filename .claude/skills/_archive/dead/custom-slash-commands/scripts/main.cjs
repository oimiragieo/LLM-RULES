#!/usr/bin/env node
/**
 * custom-slash-commands - Rule-based Skill
 * Converted from: custom-slash-commands.mdc
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
custom-slash-commands - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Enables custom slash commands, such as /commit, to generate conventional commit messages.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for custom-slash-commands:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('custom-slash-commands skill loaded. Use with Claude for code review.');
