'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('user-prompt-unified uses reflection spawn request contract reader', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), '.claude', 'hooks', 'routing', 'user-prompt-unified.core.cjs'),
    'utf8'
  );

  assert.match(source, /readSpawnRequestsFile/);
  assert.match(source, /buildStep0ReminderMessage/);
  assert.doesNotMatch(source, /JSON\.parse\(raw\)/);
});
