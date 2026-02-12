'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../../../.claude/tools/cli/open-findings-trend-snapshot.cjs');

test('parseArgs reads source and json flags', () => {
  const opts = parseArgs([
    'node',
    'open-findings-trend-snapshot.cjs',
    '--json',
    '--source',
    'nightly-scheduler',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.source, 'nightly-scheduler');
});
