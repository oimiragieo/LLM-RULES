#!/usr/bin/env node
'use strict';

/**
 * vercel-ai-sdk-best-practices tool - CLI entry point
 * Wraps the vercel-ai-sdk-best-practices skill for CLI invocation.
 *
 * Usage: node .claude/tools/vercel-ai-sdk-best-practices/main.cjs [--json] [--help]
 */

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log('Usage: node ' + path.basename(__filename) + ' [--json] [--help]');
    console.log('Wraps the vercel-ai-sdk-best-practices skill for CLI invocation.');
    process.exit(0);
  }

  const jsonMode = args.includes('--json');

  // Load skill definition
  const skillPath = path.resolve(__dirname, '../../skills/vercel-ai-sdk-best-practices/SKILL.md');
  if (!fs.existsSync(skillPath)) {
    const err = { error: 'Skill SKILL.md not found at ' + skillPath };
    console.error(jsonMode ? JSON.stringify(err) : err.error);
    process.exit(1);
  }

  const result = {
    skill: 'vercel-ai-sdk-best-practices',
    status: 'ready',
    skillPath: skillPath,
    message:
      'Skill vercel-ai-sdk-best-practices is available. Invoke via Skill({ skill: "vercel-ai-sdk-best-practices" }) in agent context.',
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
