'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStep0ReminderMessage,
} = require('../../../.claude/lib/reflection/reflection-reminder-message.cjs');

test('buildStep0ReminderMessage includes count and required Step 0 instructions', () => {
  const message = buildStep0ReminderMessage(3);
  assert.match(message, /STEP 0/i);
  assert.match(message, /3 pending reflection spawn request\(s\)/);
  assert.match(message, /reflection-spawn-request\.json/);
  assert.match(message, /spawn reflection-agent/);
  assert.match(message, /Step 0 complete/);
});
