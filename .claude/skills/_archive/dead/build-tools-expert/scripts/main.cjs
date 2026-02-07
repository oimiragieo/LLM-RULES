#!/usr/bin/env node
/**
 * build-tools-expert - Consolidated Expert Skill
 * Consolidates 3 individual skills
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
build-tools-expert - Expert Skill

Usage:
  node main.cjs --list     List consolidated skills
  node main.cjs --help     Show this help

Description:
  Build tools expert including Vite, Webpack, and bundler configuration

Consolidated from: 3 skills
`);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log('Consolidated skills:');
  ['biome-rules', 'vite-build-optimization-rule', 'vite-plugins-for-qwik'].forEach(s =>
    console.log('  - ' + s)
  );
  process.exit(0);
}

console.log('build-tools-expert skill loaded. Use with Claude for expert guidance.');
