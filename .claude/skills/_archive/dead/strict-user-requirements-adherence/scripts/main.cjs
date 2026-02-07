#!/usr/bin/env node
/**
 * strict-user-requirements-adherence - Rule-based Skill
 * Converted from: strict-user-requirements-adherence.mdc
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
strict-user-requirements-adherence - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Strictly adheres to specified user flow and game rules, making sure to follow documented features.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for strict-user-requirements-adherence:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('strict-user-requirements-adherence skill loaded. Use with Claude for code review.');
