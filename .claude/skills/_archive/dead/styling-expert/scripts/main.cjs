#!/usr/bin/env node
/**
 * styling-expert - Consolidated Expert Skill
 * Consolidates 20 individual skills
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
styling-expert - Expert Skill

Usage:
  node main.cjs --list     List consolidated skills
  node main.cjs --help     Show this help

Description:
  CSS and styling expert including Tailwind, CSS-in-JS, and responsive design

Consolidated from: 20 skills
`);
  process.exit(0);
}

if (args.includes('--list')) {
  console.log('Consolidated skills:');
  [
    'css-specific-rules',
    'styled-components-attrs-method',
    'styled-components-best-practices-general',
    'styled-components-conditional-styling-css-prop',
    'styled-components-css-in-js',
    'styled-components-documentation',
    'styled-components-naming-conventions',
    'styled-components-theming',
    'styled-components-typescript-support',
    'tailwind-and-inertiajs-rules',
    'tailwind-css-and-shadcn-ui-conventions',
    'tailwind-css-best-practices',
    'tailwind-css-configuration',
    'tailwind-css-integration',
    'tailwind-css-purging',
    'tailwind-css-styling',
    'tailwind-css-styling-rule',
    'tailwind-css-styling-rules',
    'tailwind-custom-styles',
    'tailwind-dark-mode',
  ].forEach(s => console.log('  - ' + s));
  process.exit(0);
}

console.log('styling-expert skill loaded. Use with Claude for expert guidance.');
