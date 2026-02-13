#!/usr/bin/env node
/**
 * mobile-ui-development-rule - Rule-based Skill
 * Converted from: mobile-ui-development-rule.mdc
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
mobile-ui-development-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  General rules pertaining to Mobile UI development. Covers UI/UX best practices, state management, and navigation patterns.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for mobile-ui-development-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('mobile-ui-development-rule skill loaded. Use with Claude for code review.');
