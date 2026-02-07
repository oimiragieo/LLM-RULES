#!/usr/bin/env node
/**
 * latest-language-versions-and-best-practices - Rule-based Skill
 * Converted from: latest-language-versions-and-best-practices.mdc
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
latest-language-versions-and-best-practices - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Ensures the AI uses the latest stable versions of programming languages and adheres to current best practices in all files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for latest-language-versions-and-best-practices:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log(
  'latest-language-versions-and-best-practices skill loaded. Use with Claude for code review.'
);
