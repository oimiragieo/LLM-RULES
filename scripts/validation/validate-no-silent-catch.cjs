#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const EXTS = new Set(['.js', '.cjs', '.mjs']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.pnpm-store']);
const ROOTS = ['.claude/lib', '.claude/hooks', 'scripts'];
const SILENT_CATCH_RE = /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g;

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return out;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
      continue;
    }
    const ext = path.extname(ent.name);
    if (EXTS.has(ext)) out.push(path.join(dir, ent.name));
  }
  return out;
}

const files = [];
for (const relRoot of ROOTS) {
  const fullRoot = path.join(ROOT, relRoot);
  if (fs.existsSync(fullRoot)) {
    walk(fullRoot, files);
  }
}
const issues = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel === path.join('scripts', 'validation', 'validate-no-silent-catch.cjs')) {
    continue;
  }
  if (rel.includes('.archive') || rel.includes('_archive')) {
    continue;
  }
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_err) {
    continue;
  }
  let match;
  while ((match = SILENT_CATCH_RE.exec(text)) !== null) {
    const line = text.slice(0, match.index).split('\n').length;
    issues.push(`${rel}:${line}`);
  }
}

if (issues.length > 0) {
  process.stderr.write(
    [
      `Silent promise catches found (${issues.length}):`,
      ...issues.slice(0, 50),
      issues.length > 50 ? `...and ${issues.length - 50} more` : '',
    ]
      .filter(Boolean)
      .join('\n') + '\n'
  );
  process.exit(1);
}

process.stdout.write('No silent `.catch(() => {})` patterns found.\n');
