#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BASELINE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'config',
  'module-size-baseline.json'
);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archive') continue;
      walk(full, acc);
    } else if (entry.isFile() && full.endsWith('.cjs')) {
      acc.push(full);
    }
  }
  return acc;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    threshold: 500,
    baselinePath: DEFAULT_BASELINE,
    writeBaseline: args.includes('--write-baseline'),
    strict: args.includes('--strict'),
    json: args.includes('--json'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && args[i + 1]) {
      opts.threshold = Number(args[++i]) || opts.threshold;
    } else if (args[i] === '--baseline' && args[i + 1]) {
      opts.baselinePath = path.resolve(args[++i]);
    }
  }
  return opts;
}

function countLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function loadBaseline(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  const roots = [
    path.join(PROJECT_ROOT, '.claude', 'hooks'),
    path.join(PROJECT_ROOT, '.claude', 'lib'),
  ];
  const files = roots.flatMap(root => walk(root));
  const baseline = loadBaseline(opts.baselinePath);

  const oversized = files
    .map(file => ({ file: path.relative(PROJECT_ROOT, file), lines: countLines(file) }))
    .filter(entry => entry.lines > opts.threshold)
    .sort((a, b) => b.lines - a.lines);

  if (opts.writeBaseline) {
    const next = {};
    for (const entry of oversized) next[entry.file] = entry.lines;
    fs.mkdirSync(path.dirname(opts.baselinePath), { recursive: true });
    fs.writeFileSync(opts.baselinePath, JSON.stringify(next, null, 2), 'utf8');
  }

  const newViolations = oversized.filter(entry => baseline[entry.file] === undefined);
  const growthViolations = oversized.filter(
    entry => baseline[entry.file] !== undefined && entry.lines > Number(baseline[entry.file])
  );

  const result = {
    threshold: opts.threshold,
    baselinePath: path.relative(PROJECT_ROOT, opts.baselinePath),
    oversizedCount: oversized.length,
    newViolationCount: newViolations.length,
    growthViolationCount: growthViolations.length,
    newViolations,
    growthViolations,
    strict: opts.strict,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (newViolations.length === 0 && growthViolations.length === 0) {
    process.stdout.write('module-size-guardrail: PASS\n');
  } else {
    const total = newViolations.length + growthViolations.length;
    process.stdout.write(`module-size-guardrail: ${opts.strict ? 'FAIL' : 'WARN'} (${total})\n`);
    for (const item of newViolations) {
      process.stdout.write(` - NEW ${item.file}: ${item.lines} lines\n`);
    }
    for (const item of growthViolations) {
      process.stdout.write(
        ` - GROWTH ${item.file}: ${baseline[item.file]} -> ${item.lines} lines\n`
      );
    }
  }

  if (opts.strict && (newViolations.length > 0 || growthViolations.length > 0)) {
    process.exitCode = 1;
  }
  return result;
}

if (require.main === module) {
  main();
}

module.exports = { main };
