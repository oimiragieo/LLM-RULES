#!/usr/bin/env node
/**
 * commit-message-guidelines - Rule-based Skill
 * Converted from: commit-message-guidelines.mdc
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
commit-message-guidelines - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Provides guidelines for creating conventional commit messages, ensuring they adhere to a specific format and are concise.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for commit-message-guidelines:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('commit-message-guidelines skill loaded. Use with Claude for code review.');
