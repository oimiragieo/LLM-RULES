#!/usr/bin/env node
/**
 * imports-aliasing - Rule-based Skill
 * Converted from: imports-aliasing.mdc
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
imports-aliasing - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Recommends using aliased imports as defined in svelte.config.js. This improves code organization and readability, especially when dealing with complex project structures.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for imports-aliasing:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('imports-aliasing skill loaded. Use with Claude for code review.');
