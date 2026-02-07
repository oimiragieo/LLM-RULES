#!/usr/bin/env node
/**
 * repository-class-conventions - Rule-based Skill
 * Converted from: repository-class-conventions.mdc
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
repository-class-conventions - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Governs the structure and functionality of repository classes, emphasizing the use of JpaRepository, JPQL queries, and EntityGraphs to prevent N+1 problems.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for repository-class-conventions:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('repository-class-conventions skill loaded. Use with Claude for code review.');
