#!/usr/bin/env node
/**
 * angular-expert - Consolidated Expert Skill
 * Consolidates 1 individual skills
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
angular-expert - Expert Skill

Usage:
  node main.cjs --list     List consolidated skills
  node main.cjs --help     Show this help

Description:
  Angular framework expert including components, services, RxJS, templates, and testing

Consolidated from: 1 skills
`);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log('Consolidated skills:');
  ['angular-expert'].forEach(s => console.log('  - ' + s));
  process.exit(0);
}

console.log('angular-expert skill loaded. Use with Claude for expert guidance.');
