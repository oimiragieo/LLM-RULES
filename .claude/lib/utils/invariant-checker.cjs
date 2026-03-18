'use strict';

/**
 * Banned tools for the router agent (subset of known routing violations).
 * Extend as needed.
 */
const ROUTER_BANNED_TOOLS = new Set([
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
]);

/**
 * Built-in invariant: no banned tool usage by the router.
 * Flags any event where agent === 'router' and the tool is in the banned set.
 */
const noBannedTools = {
  rule: 'no-banned-tools',
  check(events) {
    return events
      .filter(e => e.agent === 'router' && ROUTER_BANNED_TOOLS.has(e.tool))
      .map(e => ({
        rule: 'no-banned-tools',
        event: e,
        reason: `Router used banned tool: ${e.tool}`,
      }));
  },
};

/**
 * Built-in invariant: at least one TaskUpdate event must be present.
 * Flags a single synthetic violation when no TaskUpdate tool call exists.
 */
const requiresTaskUpdate = {
  rule: 'requires-task-update',
  check(events) {
    const hasTaskUpdate = events.some(e => e.tool === 'TaskUpdate');
    if (!hasTaskUpdate && events.length > 0) {
      return [
        {
          rule: 'requires-task-update',
          event: null,
          reason: 'No TaskUpdate call found in event stream',
        },
      ];
    }
    return [];
  },
};

/**
 * Built-in invariant: total tool calls must not exceed 100.
 */
const maxToolCalls = {
  rule: 'max-tool-calls',
  check(events) {
    const toolEvents = events.filter(e => e.type === 'tool_use');
    if (toolEvents.length > 100) {
      return [
        {
          rule: 'max-tool-calls',
          event: null,
          reason: `Excessive tool calls: ${toolEvents.length} (max 100)`,
        },
      ];
    }
    return [];
  },
};

/**
 * The default set of built-in invariants.
 */
const BUILT_IN_INVARIANTS = [noBannedTools, requiresTaskUpdate, maxToolCalls];

/**
 * Check a stream of events against a set of invariant rules.
 *
 * @param {{ events: Array<{type: string, agent: string, tool: string, timestamp: Date}>, invariants: Array<{rule: string, check: Function}> }} opts
 * @returns {{ violations: Array<{rule: string, event: object|null, reason: string}>, passed: boolean }}
 */
function checkInvariants({ events, invariants }) {
  const violations = [];

  for (const invariant of invariants) {
    const found = invariant.check(events);
    for (const v of found) {
      violations.push(v);
    }
  }

  return {
    violations,
    passed: violations.length === 0,
  };
}

module.exports = { checkInvariants, BUILT_IN_INVARIANTS };
