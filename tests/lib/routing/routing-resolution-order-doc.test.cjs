'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOC_PATH = path.join(process.cwd(), '.claude', 'workflows', 'core', 'router-decision.md');

test('INT-07: router decision doc declares routing resolution order and refactor precedence', () => {
  const content = fs.readFileSync(DOC_PATH, 'utf8');

  assert.match(content, /ROUTING_TABLE/i, 'doc must mention ROUTING_TABLE');
  assert.match(content, /ROUTING_PATTERNS/i, 'doc must mention ROUTING_PATTERNS');
  assert.match(content, /INTENT_KEYWORDS/i, 'doc must mention INTENT_KEYWORDS');

  assert.match(
    content,
    /ROUTING_TABLE[\s\S]*ROUTING_PATTERNS[\s\S]*INTENT_KEYWORDS/i,
    'doc must state ordered precedence: ROUTING_TABLE -> ROUTING_PATTERNS -> INTENT_KEYWORDS'
  );

  assert.match(
    content,
    /refactor[\s\S]*code-simplifier[\s\S]*precedence/i,
    'doc must state refactor -> code-simplifier precedence over generic architect matches'
  );
});
