#!/usr/bin/env node
'use strict';

/**
 * ask-questions-if-underspecified tool - CLI entry point
 * Wraps the ask-questions-if-underspecified skill for CLI invocation.
 *
 * Usage: node .claude/tools/ask-questions-if-underspecified/main.cjs [--json] [--help]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('Usage: node ' + path.basename(__filename) + ' [--json] [--help]');
    console.log('Wraps the ask-questions-if-underspecified skill for CLI invocation.');
    process.exit(0);
  }

  const jsonMode = args.includes('--json');

  // Load skill definition
  const skillPath = path.resolve(
    __dirname,
    '../../skills/ask-questions-if-underspecified/SKILL.md'
  );
  if (!fs.existsSync(skillPath)) {
    const err = { error: 'Skill SKILL.md not found at ' + skillPath };
    console.error(jsonMode ? JSON.stringify(err) : err.error);
    process.exit(1);
  }

  const result = {
    skill: 'ask-questions-if-underspecified',
    status: 'ready',
    skillPath: skillPath,
    message:
      'Skill ask-questions-if-underspecified is available. Invoke via Skill({ skill: "ask-questions-if-underspecified" }) in agent context.',
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
