#!/usr/bin/env node
/**
 * communication-and-problem-solving - Rule-based Skill
 * Converted from: communication-and-problem-solving.mdc
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
communication-and-problem-solving - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Guidelines for communication, problem-solving and platform thinking applying to all files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for communication-and-problem-solving:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('communication-and-problem-solving skill loaded. Use with Claude for code review.');
