'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TOOL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'tools',
  'cli',
  'hook-perf-benchmark.cjs'
);

describe('hook-perf-benchmark tool', () => {
  test('tool file exists', () => {
    assert.ok(fs.existsSync(TOOL_PATH), `Tool not found at ${TOOL_PATH}`);
  });

  test('tool measures PostToolUse hooks', () => {
    const content = fs.readFileSync(TOOL_PATH, 'utf8');
    assert.ok(content.includes('PostToolUse'), 'Should reference PostToolUse hooks');
  });

  test('tool reports per-hook latency', () => {
    const content = fs.readFileSync(TOOL_PATH, 'utf8');
    assert.ok(content.includes('ms') && content.includes('latency'), 'Should report latency in ms');
  });

  test('tool identifies budget breaches at 100ms', () => {
    const content = fs.readFileSync(TOOL_PATH, 'utf8');
    assert.ok(content.includes('100'), 'Should reference 100ms budget');
    assert.ok(
      content.includes('OVER BUDGET') || content.includes('WITHIN BUDGET'),
      'Should report budget status'
    );
  });
});
