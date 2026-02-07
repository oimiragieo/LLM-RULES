#!/usr/bin/env node
/**
 * provide-real-file-links-rule - Rule-based Skill
 * Converted from: provide-real-file-links-rule.mdc
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
provide-real-file-links-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  This rule ensures the AI provides links to the real files instead of placeholder names like x.md.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for provide-real-file-links-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('provide-real-file-links-rule skill loaded. Use with Claude for code review.');
