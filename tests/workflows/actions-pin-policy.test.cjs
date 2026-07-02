'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');
const FULL_SHA = /^[a-f0-9]{40}$/i;

test('GitHub workflow actions are pinned to immutable commit SHAs', () => {
  const failures = [];
  for (const file of fs.readdirSync(WORKFLOWS_DIR).filter(name => /\.ya?ml$/i.test(name))) {
    const fullPath = path.join(WORKFLOWS_DIR, file);
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/uses:\s*([^@\s]+)@([^\s#]+)/);
      if (!match) return;
      const ref = match[2];
      if (!FULL_SHA.test(ref)) {
        failures.push(`${file}:${index + 1} uses mutable ref ${match[1]}@${ref}`);
      }
    });
  }

  assert.deepEqual(failures, []);
});
