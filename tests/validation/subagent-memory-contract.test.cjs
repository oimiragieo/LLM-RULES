'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('SUBAGENT_MEMORY_CONTRACT requires citing injected IDs and forbids fabricated IDs', () => {
  const doc = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'docs', 'SUBAGENT_MEMORY_CONTRACT.md'),
    'utf8'
  );

  assert.match(doc, /\[mem:<8-hex>\]/i);
  assert.match(doc, /\[rag:<8-hex>\]/i);
  assert.match(doc, /Do not invent IDs|do not invent ids/i);
});
