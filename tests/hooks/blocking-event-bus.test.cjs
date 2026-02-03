const test = require('node:test');
const assert = require('node:assert');

const eventBus = require('../../.claude/lib/events/event-bus.cjs');
const { EventTypes } = require('../../.claude/lib/events/event-types.cjs');
const hook = require('../../.claude/hooks/validation/plan-evolution-guard.cjs');

test('plan-evolution-guard emits TOOL_BLOCKED once on block', async () => {
  let count = 0;
  const subscription = eventBus.on(EventTypes.TOOL_BLOCKED, () => {
    count += 1;
  });

  const originalExit = process.exit;
  const originalArgv2 = process.argv[2];

  process.exit = () => {
    throw new Error('exit');
  };
  process.argv[2] = JSON.stringify({
    tool_name: 'Write',
    tool_input: {
      path: '.claude/context/plans/test-plan.md',
      content: '# Plan\nPhase 1: Something',
    },
  });

  try {
    await hook.main();
  } catch (_err) {
    // Expected: process.exit override throws to keep the test alive.
  }

  await new Promise(resolve => setTimeout(resolve, 20));

  eventBus.off(subscription);
  process.exit = originalExit;
  if (typeof originalArgv2 === 'undefined') {
    delete process.argv[2];
  } else {
    process.argv[2] = originalArgv2;
  }

  assert.strictEqual(count, 1);
});
