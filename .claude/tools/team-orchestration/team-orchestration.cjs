'use strict';

/**
 * team-orchestration companion CLI tool
 * Delegates to .claude/skills/team-orchestration/scripts/main.cjs
 *
 * Usage:
 *   node .claude/tools/team-orchestration/team-orchestration.cjs --phase plan --task my-task
 */

const path = require('path');
const { execFileSync } = require('child_process');

const scriptPath = path.resolve(
  __dirname,
  '../../skills/team-orchestration/scripts/main.cjs'
);

try {
  const result = execFileSync(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  process.stdout.write(result);
  process.exit(0);
} catch (err) {
  if (err.status !== undefined) {
    process.exit(err.status);
  }
  process.stderr.write(`[team-orchestration] Unexpected error: ${err.message}\n`);
  process.exit(1);
}
