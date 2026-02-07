#!/usr/bin/env node
/**
 * history-and-next-task-rules - Rule-based Skill
 * Converted from: history-and-next-task-rules.mdc
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
history-and-next-task-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies the format for ending responses, including a summary of requirements, code written, source tree, and next task, applying to all files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for history-and-next-task-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('history-and-next-task-rules skill loaded. Use with Claude for code review.');
