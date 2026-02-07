#!/usr/bin/env node
/**
 * elon-musk-s-algorithm-for-efficiency - Rule-based Skill
 * Converted from: elon-musk-s-algorithm-for-efficiency.mdc
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
elon-musk-s-algorithm-for-efficiency - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Implements Elon Musk's algorithm for efficiency to streamline development processes. This rule emphasizes critical questioning, simplification, optimization, acceleration, and automation.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for elon-musk-s-algorithm-for-efficiency:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('elon-musk-s-algorithm-for-efficiency skill loaded. Use with Claude for code review.');
