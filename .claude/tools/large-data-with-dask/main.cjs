#!/usr/bin/env node
'use strict';

/**
 * large-data-with-dask tool - CLI entry point
 * Wraps the large-data-with-dask skill for CLI invocation.
 *
 * Usage: node .claude/tools/large-data-with-dask/main.cjs [--json] [--help]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('Usage: node ' + path.basename(__filename) + ' [--json] [--help]');
    console.log('Wraps the large-data-with-dask skill for CLI invocation.');
    process.exit(0);
  }

  const jsonMode = args.includes('--json');

  // Load skill definition
  const skillPath = path.resolve(__dirname, '../../skills/large-data-with-dask/SKILL.md');
  if (!fs.existsSync(skillPath)) {
    const err = { error: 'Skill SKILL.md not found at ' + skillPath };
    console.error(jsonMode ? JSON.stringify(err) : err.error);
    process.exit(1);
  }

  const result = {
    skill: 'large-data-with-dask',
    status: 'ready',
    skillPath: skillPath,
    message:
      'Skill large-data-with-dask is available. Invoke via Skill({ skill: "large-data-with-dask" }) in agent context.',
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
