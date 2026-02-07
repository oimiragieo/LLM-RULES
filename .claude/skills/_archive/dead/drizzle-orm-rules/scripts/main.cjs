#!/usr/bin/env node
/**
 * drizzle-orm-rules - Rule-based Skill
 * Converted from: drizzle-orm-rules.mdc
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
  console.log('drizzle-orm-rules - Code Guidelines Skill');
  console.log('');
  console.log('Usage:');
  console.log('  node main.cjs --check <file>    Check a file against guidelines');
  console.log('  node main.cjs --list            List all guidelines');
  console.log('  node main.cjs --help            Show this help');
  console.log('');
  console.log('Description:');
  console.log('  Rules for using Drizzle ORM within the src/lib/db directory.');
  console.log('  Ensures consistent data modeling and database interactions.');
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for drizzle-orm-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('drizzle-orm-rules skill loaded. Use with Claude for code review.');
