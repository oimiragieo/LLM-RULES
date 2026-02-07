#!/usr/bin/env node
/**
 * metadata-and-seo-rules - Rule-based Skill
 * Converted from: metadata-and-seo-rules.mdc
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
metadata-and-seo-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Focuses on optimizing metadata and SEO to improve discoverability of the documentation.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for metadata-and-seo-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('metadata-and-seo-rules skill loaded. Use with Claude for code review.');
