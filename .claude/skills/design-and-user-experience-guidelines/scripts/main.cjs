#!/usr/bin/env node
/**
 * design-and-user-experience-guidelines - Rule-based Skill
 * Converted from: design-and-user-experience-guidelines.mdc
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
design-and-user-experience-guidelines - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies design and user experience guidelines, including dark mode compatibility, responsive design, performance optimization, modern UI, and accessibility. This rule promotes a user-friendly and visually appealing application.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for design-and-user-experience-guidelines:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('design-and-user-experience-guidelines skill loaded. Use with Claude for code review.');
