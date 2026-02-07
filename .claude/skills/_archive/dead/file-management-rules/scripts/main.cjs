#!/usr/bin/env node
/**
 * file-management-rules - Rule-based Skill
 * Converted from: file-management-rules.mdc
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
file-management-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies file management guidelines, including including full file paths as comments, updating project structure in AI.MD, and maintaining package.json. This rule ensures organized and well-documented project files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for file-management-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('file-management-rules skill loaded. Use with Claude for code review.');
