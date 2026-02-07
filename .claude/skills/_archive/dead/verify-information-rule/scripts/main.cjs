#!/usr/bin/env node
/**
 * verify-information-rule - Rule-based Skill
 * Converted from: verify-information-rule.mdc
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
verify-information-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  This rule ensures that the AI always verifies information before presenting it, avoiding assumptions and speculation.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for verify-information-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('verify-information-rule skill loaded. Use with Claude for code review.');
