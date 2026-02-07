#!/usr/bin/env node
/**
 * unit-testing-requirement - Rule-based Skill
 * Converted from: unit-testing-requirement.mdc
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
unit-testing-requirement - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Enforces the implementation of unit tests to guarantee code reliability and maintainability, especially within the 'tests' directory.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for unit-testing-requirement:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('unit-testing-requirement skill loaded. Use with Claude for code review.');
