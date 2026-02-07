#!/usr/bin/env node
/**
 * rell-general-rules - Rule-based Skill
 * Converted from: rell-general-rules.mdc
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
rell-general-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  General rules for writing Rell code, emphasizing clarity, correctness, and adherence to Rell-specific instructions.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for rell-general-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('rell-general-rules skill loaded. Use with Claude for code review.');
