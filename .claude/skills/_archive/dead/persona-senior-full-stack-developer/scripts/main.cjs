#!/usr/bin/env node
/**
 * persona-senior-full-stack-developer - Rule-based Skill
 * Converted from: persona---senior-full-stack-developer.mdc
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
persona-senior-full-stack-developer - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Defines the persona as a senior full-stack developer with extensive knowledge applicable to all files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for persona-senior-full-stack-developer:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('persona-senior-full-stack-developer skill loaded. Use with Claude for code review.');
