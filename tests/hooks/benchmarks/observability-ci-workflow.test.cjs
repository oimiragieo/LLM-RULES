#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('observability-ci workflow includes perf and schema gates', () => {
  const workflowPath = path.resolve(__dirname, '../../../.github/workflows/observability-ci.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.match(content, /name:\s+Observability CI/);
  assert.match(content, /node \.claude\/hooks\/benchmarks\/perf-gate\.cjs/);
  assert.match(content, /node \.claude\/hooks\/validation\/flight-recorder-schema-gate\.cjs/);
  assert.match(content, /tests\/tools\/trace-query-cli\.test\.cjs/);
});
