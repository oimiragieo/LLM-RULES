#!/usr/bin/env node
'use strict';

/**
 * paraglide-js-internationalization-i18n tool - CLI entry point
 * Wraps the paraglide-js-internationalization-i18n skill for CLI invocation.
 * 
 * Usage: node .claude/tools/paraglide-js-internationalization-i18n/main.cjs [--json] [--help]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log('Usage: node ' + path.basename(__filename) + ' [--json] [--help]');
    console.log('Wraps the paraglide-js-internationalization-i18n skill for CLI invocation.');
    process.exit(0);
  }
  
  const jsonMode = args.includes('--json');
  
  // Load skill definition
  const skillPath = path.resolve(__dirname, '../../skills/paraglide-js-internationalization-i18n/SKILL.md');
  if (!fs.existsSync(skillPath)) {
    const err = { error: 'Skill SKILL.md not found at ' + skillPath };
    console.error(jsonMode ? JSON.stringify(err) : err.error);
    process.exit(1);
  }
  
  const result = {
    skill: 'paraglide-js-internationalization-i18n',
    status: 'ready',
    skillPath: skillPath,
    message: 'Skill paraglide-js-internationalization-i18n is available. Invoke via Skill({ skill: "paraglide-js-internationalization-i18n" }) in agent context.'
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
