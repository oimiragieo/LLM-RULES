#!/usr/bin/env node
/**
 * thoughtful-and-accurate-responses - Rule-based Skill
 * Converted from: thoughtful-and-accurate-responses.mdc
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
thoughtful-and-accurate-responses - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Instructs the AI to provide accurate, factual, and thoughtful answers, emphasizing reasoning and accuracy in all contexts.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for thoughtful-and-accurate-responses:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('thoughtful-and-accurate-responses skill loaded. Use with Claude for code review.');
