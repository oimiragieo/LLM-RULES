#!/usr/bin/env node
/**
 * file-path-usage - Rule-based Skill
 * Converted from: file-path-usage.mdc
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
file-path-usage - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Enforces the use of full file paths when referencing, editing, or creating files in the project. This rule ensures consistency and accuracy in file operations across the entire project.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for file-path-usage:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('file-path-usage skill loaded. Use with Claude for code review.');
