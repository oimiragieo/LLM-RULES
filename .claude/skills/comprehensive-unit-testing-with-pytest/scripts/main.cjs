#!/usr/bin/env node
/**
 * comprehensive-unit-testing-with-pytest - Rule-based Skill
 * Converted from: comprehensive-unit-testing-with-pytest.mdc
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
comprehensive-unit-testing-with-pytest - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Aims for high test coverage using pytest, testing both common and edge cases.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for comprehensive-unit-testing-with-pytest:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log(
  'comprehensive-unit-testing-with-pytest skill loaded. Use with Claude for code review.'
);
