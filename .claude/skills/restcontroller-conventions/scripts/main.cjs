#!/usr/bin/env node
/**
 * restcontroller-conventions - Rule-based Skill
 * Converted from: restcontroller-conventions.mdc
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
restcontroller-conventions - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies standards for RestController classes, including API route mappings, HTTP method annotations, dependency injection, and error handling with ApiResponse and GlobalExceptionHandler.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for restcontroller-conventions:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('restcontroller-conventions skill loaded. Use with Claude for code review.');
