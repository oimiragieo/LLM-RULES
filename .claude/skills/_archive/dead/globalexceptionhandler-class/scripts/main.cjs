#!/usr/bin/env node
/**
 * globalexceptionhandler-class - Rule-based Skill
 * Converted from: globalexceptionhandler-class.mdc
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
globalexceptionhandler-class - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Structure of GlobalExceptionHandler class.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for globalexceptionhandler-class:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('globalexceptionhandler-class skill loaded. Use with Claude for code review.');
