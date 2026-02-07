#!/usr/bin/env node
/**
 * class-based-state-management - Rule-based Skill
 * Converted from: class-based-state-management.mdc
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
class-based-state-management - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Enforces the use of classes for complex state management (state machines) in Svelte components. Applies specifically to `
    .svelte.ts` files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for class-based-state-management:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('class-based-state-management skill loaded. Use with Claude for code review.');
