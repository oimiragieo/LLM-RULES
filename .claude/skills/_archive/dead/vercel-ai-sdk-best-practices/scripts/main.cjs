#!/usr/bin/env node
/**
 * vercel-ai-sdk-best-practices - Rule-based Skill
 * Converted from: vercel-ai-sdk-best-practices.mdc
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
vercel-ai-sdk-best-practices - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Best practices for using the Vercel AI SDK in Next.js 15 applications with React Server Components and streaming capabilities.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for vercel-ai-sdk-best-practices:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('vercel-ai-sdk-best-practices skill loaded. Use with Claude for code review.');
