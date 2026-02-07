#!/usr/bin/env node
/**
 * dto-conventions - Rule-based Skill
 * Converted from: dto-conventions.mdc
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
dto-conventions - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Sets standards for Data Transfer Objects (DTOs), typically records, including parameter validation in compact canonical constructors.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for dto-conventions:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('dto-conventions skill loaded. Use with Claude for code review.');
