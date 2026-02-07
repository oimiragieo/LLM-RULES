#!/usr/bin/env node
/**
 * windows-compatibility - Rule-based Skill
 * Converted from: windows-compatibility.mdc
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
windows-compatibility - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies guidelines for Windows compatibility, including providing PowerShell commands and avoiding Unix-specific commands. This rule ensures cross-platform compatibility for Windows users.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for windows-compatibility:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('windows-compatibility skill loaded. Use with Claude for code review.');
