#!/usr/bin/env node
/**
 * babel-configuration-for-nativewind - Rule-based Skill
 * Converted from: babel-configuration-for-nativewind.mdc
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
babel-configuration-for-nativewind - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies the correct Babel configuration for NativeWind to ensure proper processing and avoid conflicts.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for babel-configuration-for-nativewind:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('babel-configuration-for-nativewind skill loaded. Use with Claude for code review.');
