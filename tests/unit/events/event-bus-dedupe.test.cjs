'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

const EVENT_TYPE = 'AGENT_STARTED';

function payload() {
  return {
    type: EVENT_TYPE,
    agentId: 'dedupe-agent',
    agentType: 'developer',
    taskId: 'dedupe-task',
  };
}

test('eventBus.on deduplicates identical handler for same event', async () => {
  let calls = 0;
  const handler = () => {
    calls += 1;
  };

  const sub1 = eventBus.on(EVENT_TYPE, handler, 50);
  const sub2 = eventBus.on(EVENT_TYPE, handler, 50);

  await eventBus.emit(EVENT_TYPE, payload());

  assert.equal(calls, 1);
  assert.equal(sub1, sub2);

  // Cleanup once (dedupe should return same subscription object)
  eventBus.off(sub1);
});

