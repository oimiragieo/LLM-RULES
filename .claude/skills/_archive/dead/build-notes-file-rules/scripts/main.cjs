#!/usr/bin/env node
/**
 * build-notes-file-rules - Rule-based Skill
 * Converted from: build-notes-file-rules.mdc
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
build-notes-file-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Enforces rules for creating and managing build notes files within the /ProjectDocs/Build_Notes/ directory, including naming conventions, content structure, and update frequency.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for build-notes-file-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('build-notes-file-rules skill loaded. Use with Claude for code review.');
