#!/usr/bin/env node
/**
 * senior-frontend-developer-mindset - Rule-based Skill
 * Converted from: senior-frontend-developer-mindset.mdc
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
senior-frontend-developer-mindset - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Sets the mindset for a senior frontend developer concerning code quality, maintainability, and testing. This encourages developers to focus on creating clean, efficient, and well-tested code.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for senior-frontend-developer-mindset:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('senior-frontend-developer-mindset skill loaded. Use with Claude for code review.');
