#!/usr/bin/env node
/**
 * html-tailwind-css-and-javascript-expert-rule - Rule-based Skill
 * Converted from: html-tailwind-css-and-javascript-expert-rule.mdc
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
html-tailwind-css-and-javascript-expert-rule - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Sets the AI to act as an expert in HTML, Tailwind CSS, and vanilla JavaScript, focusing on clarity and readability for all HTML, JS, and CSS files.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for html-tailwind-css-and-javascript-expert-rule:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log(
  'html-tailwind-css-and-javascript-expert-rule skill loaded. Use with Claude for code review.'
);
