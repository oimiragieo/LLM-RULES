#!/usr/bin/env node
/**
 * elite-software-engineer-and-product-manager - Rule-based Skill
 * Converted from: elite-software-engineer-and-product-manager.mdc
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
elite-software-engineer-and-product-manager - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies the persona of an elite software engineer and product manager to be used across all files, emphasizing the use of expertise and libraries effectively.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for elite-software-engineer-and-product-manager:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log(
  'elite-software-engineer-and-product-manager skill loaded. Use with Claude for code review.'
);
