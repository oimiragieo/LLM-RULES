'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

test('eventBus.on enforces max total subscription cap', () => {
  const originalCap = eventBus.maxTotalSubscriptions;
  const originalLength = eventBus.subscriptions.length;
  const cap = originalLength + 1;
  eventBus.maxTotalSubscriptions = cap;

  const sub = eventBus.on('AGENT_STARTED', () => {});
  assert.ok(sub);

  assert.throws(() => eventBus.on('AGENT_COMPLETED', () => {}), /subscription limit exceeded/i);

  eventBus.off(sub);
  eventBus.maxTotalSubscriptions = originalCap;
});
