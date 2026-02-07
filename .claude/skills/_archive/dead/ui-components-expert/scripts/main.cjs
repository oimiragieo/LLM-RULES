#!/usr/bin/env node
/**
 * ui-components-expert - Consolidated Expert Skill
 * Consolidates 9 individual skills
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
ui-components-expert - Expert Skill

Usage:
  node main.cjs --list     List consolidated skills
  node main.cjs --help     Show this help

Description:
  UI component library expert including Chakra, Material UI, and Mantine

Consolidated from: 9 skills
`);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log('Consolidated skills:');
  [
    'chakra-ui-accessibility-features',
    'chakra-ui-best-practices',
    'chakra-ui-component-composition',
    'chakra-ui-dark-mode-implementation',
    'chakra-ui-performance-optimization',
    'chakra-ui-responsive-design',
    'chakra-ui-semantic-html-rendering',
    'chakra-ui-theme-directory-rules',
    'material-ui-configuration',
  ].forEach(s => console.log('  - ' + s));
  process.exit(0);
}

console.log('ui-components-expert skill loaded. Use with Claude for expert guidance.');
