'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_LEGACY_REFERENCE_FILES = new Set([
  '.claude/hooks/routing/pre-tool-unified.read-safety.cjs',
  '.claude/hooks/routing/spawn-prompt-assembler.task-tools.cjs',
]);

function collectFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archive' || entry.name === 'context') {
        continue;
      }
      collectFiles(fullPath, out);
      continue;
    }

    if (!/\.(cjs|js|mjs|md)$/.test(entry.name)) {
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

test('active runtime code/docs do not reference deprecated safe-json-parse.cjs path', () => {
  const roots = [
    path.join(PROJECT_ROOT, '.claude', 'hooks'),
    path.join(PROJECT_ROOT, '.claude', 'lib'),
    path.join(PROJECT_ROOT, '.claude', 'rules'),
    path.join(PROJECT_ROOT, '.claude', 'templates', 'spawn'),
  ];

  const offenders = [];
  for (const root of roots) {
    const files = collectFiles(root);
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('safe-json-parse.cjs')) {
        const relPath = path.relative(PROJECT_ROOT, filePath).replaceAll('\\', '/');
        if (!ALLOWED_LEGACY_REFERENCE_FILES.has(relPath)) {
          offenders.push(path.relative(PROJECT_ROOT, filePath));
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found deprecated safe-json-parse.cjs references in active files:\n${offenders.join('\n')}`
  );
});
