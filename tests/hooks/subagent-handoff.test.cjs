#!/usr/bin/env node
/**
 * subagent-handoff.test.cjs
 *
 * Tests for P2d: SubagentStop / handoff guard
 *
 * Documents expected behavior for:
 *  1) SubagentStop uses agent_type (not deprecated agent_name) to update active-agent state
 *  2) Handoff guard: once handoff_target is spawned (handoff_executed=true), allow
 *     subsequent Task spawns without re-blocking
 *
 * State machine:
 *   routing_complete -> handoff_required -> handoff_executed -> normal_spawns_allowed
 *
 * SubagentStop payload (from HOOKS.md):
 *   { hook_event_name: 'SubagentStop', agent_type: 'developer', agent_id: 'agent-1', ... }
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const GUARD_MODULE = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'routing',
  'subagent-handoff-guard.cjs'
);

// ─── Test 1: SubagentStop uses agent_type ────────────────────────────────────

describe('SubagentStop: agent_type field', () => {
  it('decrements active-agent count using agent_type from hook payload', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // Simulate two agents started (external tracking — guard tracks via start events)
    guard.onSubagentStart({ agent_type: 'developer', agent_id: 'agent-1' });
    guard.onSubagentStart({ agent_type: 'developer', agent_id: 'agent-2' });

    assert.strictEqual(guard.getActiveCount(), 2, 'Two agents should be active');

    // SubagentStop fires with agent_type — NOT a deprecated agent_name field
    guard.onSubagentStop({ agent_type: 'developer', agent_id: 'agent-1' });

    assert.strictEqual(guard.getActiveCount(), 1, 'Count should decrement on SubagentStop');
  });

  it('correctly tracks agent_id in active set', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    guard.onSubagentStart({ agent_type: 'qa', agent_id: 'agent-qa-1' });

    assert.ok(guard.isAgentActive('agent-qa-1'), 'agent-qa-1 should be in active set');

    guard.onSubagentStop({ agent_type: 'qa', agent_id: 'agent-qa-1' });

    assert.ok(!guard.isAgentActive('agent-qa-1'), 'agent-qa-1 should be removed on stop');
  });

  it('handles SubagentStop for unknown agent_id gracefully', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // Should not throw — unknown stop events are idempotent
    assert.doesNotThrow(() => {
      guard.onSubagentStop({ agent_type: 'developer', agent_id: 'unknown-agent' });
    }, 'Stopping unknown agent_id should not throw');

    assert.strictEqual(guard.getActiveCount(), 0, 'Count should remain 0');
  });
});

// ─── Test 2: Handoff guard allows workers after coordinator ──────────────────

describe('Handoff guard: allows workers after coordinator', () => {
  it('allows first Task spawn (handoff target) when routing_complete', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // Set routing state: routing complete, handoff_target = 'developer'
    guard.setHandoffTarget('developer');

    // First spawn: the coordinator/handoff target → should be allowed
    const result = guard.checkSpawnAllowed({ agent_type: 'developer' });

    assert.strictEqual(result.allow, true, 'Handoff target spawn should be allowed');
    assert.strictEqual(
      guard.getHandoffState().handoff_executed,
      true,
      'handoff_executed should be set to true after first spawn'
    );
  });

  it('allows subsequent worker spawns once handoff_executed is true', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // Setup: handoff already executed (coordinator was spawned)
    guard.setHandoffTarget('developer');
    guard.checkSpawnAllowed({ agent_type: 'developer' }); // execute handoff

    // Subsequent spawn: any worker type → should be allowed
    const workerResult = guard.checkSpawnAllowed({ agent_type: 'qa' });

    assert.strictEqual(workerResult.allow, true, 'Worker spawn after handoff should be allowed');
  });

  it('handoff guard only enforces for first spawn after routing_complete', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // No handoff target set → all spawns allowed (guard is inactive)
    const result1 = guard.checkSpawnAllowed({ agent_type: 'developer' });
    assert.strictEqual(result1.allow, true, 'Spawn allowed when no handoff required');

    const result2 = guard.checkSpawnAllowed({ agent_type: 'qa' });
    assert.strictEqual(result2.allow, true, 'Second spawn also allowed when no handoff required');
  });

  it('getHandoffState reports correct state machine transitions', () => {
    const guard = require(GUARD_MODULE);
    guard.reset();

    // Initial state
    let state = guard.getHandoffState();
    assert.strictEqual(state.handoff_target, null, 'No handoff target initially');
    assert.strictEqual(state.handoff_executed, false, 'Not executed initially');
    assert.strictEqual(state.routing_complete, false, 'Routing not complete initially');

    // After setting handoff target
    guard.setHandoffTarget('developer');
    state = guard.getHandoffState();
    assert.strictEqual(state.handoff_target, 'developer', 'Target should be set');
    assert.strictEqual(state.routing_complete, true, 'Routing is complete');
    assert.strictEqual(state.handoff_executed, false, 'Not yet executed');

    // After executing handoff
    guard.checkSpawnAllowed({ agent_type: 'developer' });
    state = guard.getHandoffState();
    assert.strictEqual(state.handoff_executed, true, 'Executed after coordinator spawn');
  });
});
