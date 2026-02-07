#!/usr/bin/env node
/**
 * single-chunk-edits-rule - Rule-based Skill
 * Converted from: single-chunk-edits-rule.mdc
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
single-chunk-edits-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  This rule requires the AI to provide all edits in a single chunk, avoiding multiple-step instructions for the same file.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for single-chunk-edits-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('single-chunk-edits-rule skill loaded. Use with Claude for code review.');
