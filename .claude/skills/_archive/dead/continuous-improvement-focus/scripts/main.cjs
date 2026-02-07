#!/usr/bin/env node
/**
 * continuous-improvement-focus - Rule-based Skill
 * Converted from: continuous-improvement-focus.mdc
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
continuous-improvement-focus - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Emphasizes continuous improvement by suggesting process improvements and looking for opportunities to simplify and optimize code and workflows. This rule promotes a culture of ongoing refinement.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for continuous-improvement-focus:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('continuous-improvement-focus skill loaded. Use with Claude for code review.');
