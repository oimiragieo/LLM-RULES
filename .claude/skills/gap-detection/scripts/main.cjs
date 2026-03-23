'use strict';

/**
 * gap-detection/scripts/main.cjs
 * CLI entry point for the gap-detection skill.
 * Usage: node .claude/skills/gap-detection/scripts/main.cjs [--dir <path>] [--output <path>]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const outIdx = args.indexOf('--output');
const targetDir = dirIdx !== -1 ? args[dirIdx + 1] : process.cwd();
const outputPath =
  outIdx !== -1
    ? args[outIdx + 1]
    : path.join(
        targetDir,
        '.claude',
        'context',
        'tmp',
        `gap-detection-report-${new Date().toISOString().slice(0, 10)}.md`
      );

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, shell: false, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return e.stdout || '';
  }
}

function scanNoReadme(dir) {
  const result = run(
    'find . -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.cjs" \\) ' +
      '! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" -print',
    dir
  );
  const files = result.split('\n').filter(Boolean);
  const gaps = [];
  const seen = new Set();
  for (const f of files) {
    const d = path.dirname(f);
    if (seen.has(d)) continue;
    seen.add(d);
    const hasReadme =
      fs.existsSync(path.join(dir, d, 'README.md')) || fs.existsSync(path.join(dir, d, 'index.md'));
    if (!hasReadme) gaps.push(`NO_README: ${f}`);
  }
  return gaps;
}

function scanTodos(dir) {
  const result = run(
    'grep -rn --include="*.ts" --include="*.js" --include="*.cjs" ' +
      '-E "(TODO|FIXME|HACK|XXX):" ' +
      '--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist .',
    dir
  );
  return result.split('\n').filter(Boolean);
}

const noReadme = scanNoReadme(targetDir);
const todos = scanTodos(targetDir);

const reportLines = [
  `## Gap Detection Report — ${new Date().toISOString().slice(0, 10)}`,
  '',
  '| Category   | Count |',
  '| ---------- | ----- |',
  `| NO_README  | ${noReadme.length} |`,
  `| TODO/FIXME | ${todos.length} |`,
  '',
  '### NO_README Gaps (first 20)',
  ...noReadme.slice(0, 20),
  '',
  '### TODO/FIXME Markers (first 20)',
  ...todos.slice(0, 20),
];

const report = reportLines.join('\n');
const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, report, 'utf8');
process.stdout.write(`Report written to: ${outputPath}\n`);
process.stdout.write(
  JSON.stringify({ noReadme: noReadme.length, todos: todos.length, report: outputPath }) + '\n'
);
