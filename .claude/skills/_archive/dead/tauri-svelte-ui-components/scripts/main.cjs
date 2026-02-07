#!/usr/bin/env node
/**
 * tauri-svelte-ui-components - Rule-based Skill
 * Converted from: tauri-svelte-ui-components.mdc
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
tauri-svelte-ui-components - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Rules specific to Svelte UI component development in Tauri applications.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for tauri-svelte-ui-components:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('tauri-svelte-ui-components skill loaded. Use with Claude for code review.');
