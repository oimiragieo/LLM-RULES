#!/usr/bin/env node
'use strict';

/**
 * project-stage-detection companion CLI tool
 *
 * Wraps .claude/skills/project-stage-detection/scripts/main.cjs
 * for use as a standalone CLI utility.
 *
 * Usage:
 *   node .claude/tools/project-stage-detection/project-stage-detection.cjs [--dir <path>] [--json]
 *
 * Options:
 *   --dir <path>   Project root to analyze (default: cwd)
 *   --json         Output compact JSON instead of pretty-printed
 *   --help         Show usage
 */

const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    [
      'project-stage-detection — Detect project maturity stage from file structure',
      '',
      'Usage:',
      '  node project-stage-detection.cjs [--dir <path>] [--json]',
      '',
      'Options:',
      '  --dir <path>   Project root to analyze (default: current directory)',
      '  --json         Output compact JSON (default: pretty-printed JSON)',
      '  --help         Show this help message',
      '',
      'Stage values:',
      '  new     Score 0-2  Empty or freshly initialized project',
      '  early   Score 3-5  Has core structure but missing infrastructure',
      '  mid     Score 6-7  Functional codebase, quality gaps remain',
      '  mature  Score 8+   Full quality infrastructure in place',
      '',
      'Exit codes:',
      '  0  Success — detection complete',
      '  1  Error — directory not found or unreadable',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const scriptPath = path.resolve(__dirname, '../../skills/project-stage-detection/scripts/main.cjs');

try {
  const result = execFileSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    shell: false,
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  process.stdout.write(result);
  process.exit(0);
} catch (err) {
  if (err.status !== undefined) {
    process.stderr.write(err.stderr || '');
    process.exit(err.status);
  }
  process.stderr.write(`[project-stage-detection] Unexpected error: ${err.message}\n`);
  process.exit(1);
}
