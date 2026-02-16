#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('memory-ci workflow runs perf gate and telemetry schema gate', () => {
  const workflowPath = path.resolve(__dirname, '../../../.github/workflows/memory-ci.yml');
  const content = fs.readFileSync(workflowPath, 'utf8');

  assert.match(content, /node \.claude\/hooks\/benchmarks\/perf-gate\.cjs/);
  assert.match(content, /node \.claude\/hooks\/validation\/flight-recorder-schema-gate\.cjs/);
});
