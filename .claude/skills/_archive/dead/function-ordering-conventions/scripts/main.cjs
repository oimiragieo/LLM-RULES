#!/usr/bin/env node
/**
 * function-ordering-conventions - Rule-based Skill
 * Converted from: function-ordering-conventions.mdc
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
function-ordering-conventions - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Defines the function ordering conventions, where functions that compose other functions appear earlier in the file, regardless of the file type.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for function-ordering-conventions:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('function-ordering-conventions skill loaded. Use with Claude for code review.');
