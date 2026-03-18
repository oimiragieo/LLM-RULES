'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkInvariants, BUILT_IN_INVARIANTS } = require('../../.claude/lib/utils/invariant-checker.cjs');

describe('invariant-checker', () => {
  const BASE_TIME = new Date('2026-01-08T00:00:00Z');
  const makeEvent = (type, agent, tool, offsetSec = 0) => ({
    type,
    agent,
    tool,
    timestamp: new Date(BASE_TIME.getTime() + offsetSec * 1000),
  });

  it('returns passed:true and no violations for a clean event stream', () => {
    const events = [
      makeEvent('tool_use', 'developer', 'Read', 0),
      makeEvent('tool_use', 'developer', 'TaskUpdate', 1),
    ];
    const result = checkInvariants({ events, invariants: BUILT_IN_INVARIANTS });
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);
  });

  it('detects banned tool usage', () => {
    const events = [
      makeEvent('tool_use', 'router', 'Grep', 0),
    ];
    const result = checkInvariants({ events, invariants: BUILT_IN_INVARIANTS });
    assert.equal(result.passed, false);
    const violation = result.violations.find(v => v.rule === 'no-banned-tools');
    assert.ok(violation, 'should have a no-banned-tools violation');
    assert.ok(violation.reason.includes('Grep'));
  });

  it('detects missing TaskUpdate in an agent session', () => {
    const events = [
      makeEvent('tool_use', 'developer', 'Read', 0),
      makeEvent('tool_use', 'developer', 'Write', 1),
      makeEvent('tool_use', 'developer', 'Bash', 2),
      // No TaskUpdate
    ];
    const result = checkInvariants({ events, invariants: BUILT_IN_INVARIANTS });
    assert.equal(result.passed, false);
    const violation = result.violations.find(v => v.rule === 'requires-task-update');
    assert.ok(violation, 'should have a requires-task-update violation');
  });

  it('detects excessive tool calls (>100)', () => {
    const events = [];
    for (let i = 0; i < 101; i++) {
      events.push(makeEvent('tool_use', 'developer', 'Read', i));
    }
    // Add TaskUpdate to avoid that violation
    events.push(makeEvent('tool_use', 'developer', 'TaskUpdate', 102));
    const result = checkInvariants({ events, invariants: BUILT_IN_INVARIANTS });
    assert.equal(result.passed, false);
    const violation = result.violations.find(v => v.rule === 'max-tool-calls');
    assert.ok(violation, 'should have a max-tool-calls violation');
    assert.ok(violation.reason.includes('102') || violation.reason.includes('101'));
  });

  it('supports custom invariants alongside built-ins', () => {
    const customInvariant = {
      rule: 'no-write-by-router',
      check: (events) => events
        .filter(e => e.agent === 'router' && e.tool === 'Write')
        .map(e => ({ rule: 'no-write-by-router', event: e, reason: 'Router must not use Write' })),
    };
    const events = [
      makeEvent('tool_use', 'developer', 'TaskUpdate', 0),
      makeEvent('tool_use', 'router', 'Write', 1),
    ];
    const result = checkInvariants({ events, invariants: [customInvariant] });
    assert.equal(result.passed, false);
    assert.equal(result.violations[0].rule, 'no-write-by-router');
  });

  it('returns passed:false when multiple invariants are violated', () => {
    const events = [
      makeEvent('tool_use', 'router', 'Grep', 0), // banned tool
      // no TaskUpdate — missing
    ];
    const result = checkInvariants({ events, invariants: BUILT_IN_INVARIANTS });
    assert.equal(result.passed, false);
    assert.ok(result.violations.length >= 2);
  });

  it('returns passed:true for empty events with no built-in violations', () => {
    // Empty stream: no banned tools, no tool calls at all (max-tool-calls fine),
    // but missing TaskUpdate would trigger. Use custom empty invariants.
    const result = checkInvariants({ events: [], invariants: [] });
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);
  });
});
