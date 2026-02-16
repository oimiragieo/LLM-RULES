'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(process.cwd(), '.claude', 'hooks');
const ALLOWLIST = new Set([]);

function collectHookFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '_archive') continue;
      out.push(...collectHookFiles(full));
    } else if (e.isFile() && e.name.endsWith('.cjs')) {
      out.push(full);
    }
  }
  return out;
}

test('active hooks do not use parseHookInputSync', () => {
  const hits = [];
  for (const file of collectHookFiles(ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes('parseHookInputSync(')) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (!ALLOWLIST.has(rel)) hits.push(rel);
    }
  }

  assert.deepEqual(hits, []);
});
