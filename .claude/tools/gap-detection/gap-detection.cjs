'use strict';

/**
 * gap-detection.cjs — CLI companion tool for the gap-detection skill.
 * Usage: node .claude/tools/gap-detection/gap-detection.cjs [--dir <path>] [--help]
 */

const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    [
      'gap-detection — Project health and documentation gap scanner',
      '',
      'Usage:',
      '  node .claude/tools/gap-detection/gap-detection.cjs [options]',
      '',
      'Options:',
      '  --dir <path>     Directory to scan (default: cwd)',
      '  --output <path>  Report output path',
      '  --help, -h       Show this help',
      '',
      'Invokes: .claude/skills/gap-detection/scripts/main.cjs',
    ].join('\n') + '\n'
  );
  process.exit(0);
}

const scriptPath = path.resolve(__dirname, '../../skills/gap-detection/scripts/main.cjs');
try {
  execFileSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
