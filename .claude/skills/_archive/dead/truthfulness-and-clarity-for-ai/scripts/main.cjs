#!/usr/bin/env node
/**
 * truthfulness-and-clarity-for-ai - Rule-based Skill
 * Converted from: truthfulness-and-clarity-for-ai.mdc
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
truthfulness-and-clarity-for-ai - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specifies guidelines for the AI assistant to provide accurate, thoughtful answers, admit when it doesn't know something, and be concise while ensuring clarity. This rule promotes trustworthy and helpful AI responses.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for truthfulness-and-clarity-for-ai:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('truthfulness-and-clarity-for-ai skill loaded. Use with Claude for code review.');
