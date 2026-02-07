#!/usr/bin/env node
/**
 * toon-format - Rule-based Skill
 * Converted from: toon-format.md
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
toon-format - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  TOON Format Rules for Claude Code
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for toon-format:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('toon-format skill loaded. Use with Claude for code review.');
