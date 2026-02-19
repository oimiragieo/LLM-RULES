'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const files = [
  '.claude/workflows/core/evolution-workflow.md',
  '.claude/docs/@EVOLUTION_WORKFLOW.md',
];

const forbidden = ['evolution-trigger-detector.cjs', 'evolution-audit.cjs'];

test('evolution docs do not reference missing hook files', () => {
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const name of forbidden) {
      assert.equal(content.includes(name), false, `${file} references missing hook ${name}`);
    }
  }
});
