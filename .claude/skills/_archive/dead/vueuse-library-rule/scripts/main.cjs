#!/usr/bin/env node
/**
 * vueuse-library-rule - Rule-based Skill
 * Converted from: vueuse-library-rule.mdc
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
vueuse-library-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Encourages leveraging VueUse functions throughout the project to enhance reactivity and performance.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for vueuse-library-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('vueuse-library-rule skill loaded. Use with Claude for code review.');
