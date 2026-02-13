#!/usr/bin/env node
/**
 * visual-and-observational-rules - Rule-based Skill
 * Converted from: visual-and-observational-rules.mdc
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
visual-and-observational-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Defines the visual aspects of the game and how the player observes the world. This includes map color-coding, screen effects, and the overall simulation style.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for visual-and-observational-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('visual-and-observational-rules skill loaded. Use with Claude for code review.');
