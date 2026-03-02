#!/usr/bin/env node
'use strict';

/**
 * nativewind-and-tailwind-css-compatibility tool - CLI entry point
 * Wraps the nativewind-and-tailwind-css-compatibility skill for CLI invocation.
 * 
 * Usage: node .claude/tools/nativewind-and-tailwind-css-compatibility/main.cjs [--json] [--help]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Usage: node ' + path.basename(__filename) + ' [--json] [--help]');
    console.log('Wraps the nativewind-and-tailwind-css-compatibility skill for CLI invocation.');
    process.exit(0);
  }
  
  const jsonMode = args.includes('--json');
  
  // Load skill definition
  const skillPath = path.resolve(__dirname, '../../skills/nativewind-and-tailwind-css-compatibility/SKILL.md');
  if (!fs.existsSync(skillPath)) {
    const err = { error: 'Skill SKILL.md not found at ' + skillPath };
    console.error(jsonMode ? JSON.stringify(err) : err.error);
    process.exit(1);
  }
  
  const result = {
    skill: 'nativewind-and-tailwind-css-compatibility',
    status: 'ready',
    skillPath: skillPath,
    message: 'Skill nativewind-and-tailwind-css-compatibility is available. Invoke via Skill({ skill: "nativewind-and-tailwind-css-compatibility" }) in agent context.'
  };
  
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
