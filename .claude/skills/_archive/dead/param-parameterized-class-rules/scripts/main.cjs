#!/usr/bin/env node
/**
 * param-parameterized-class-rules - Rule-based Skill
 * Converted from: param-parameterized-class-rules.mdc
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
param-parameterized-class-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Rules related to Param, to be applied when defining models. Models use Param to define parameters with validation and reactivity.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for param-parameterized-class-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('param-parameterized-class-rules skill loaded. Use with Claude for code review.');
