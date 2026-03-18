#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createTrajectory,
  addStep,
  finalizeTrajectory,
  normalizeSessionLog,
} = require('../../.claude/lib/diagnostics/trajectory-normalizer.cjs');

describe('trajectory-normalizer (F4)', () => {
  describe('createTrajectory', () => {
    it('creates a valid trajectory', () => {
      const t = createTrajectory({ sessionId: 'sess-1', agentType: 'developer' });
      assert.equal(t.session_id, 'sess-1');
      assert.equal(t.agent_type, 'developer');
      assert.equal(t.outcome, 'partial');
      assert.equal(t.steps.length, 0);
      assert.ok(t.started_at);
    });

    it('uses defaults for optional fields', () => {
      const t = createTrajectory({ sessionId: 'x', agentType: 'qa' });
      assert.equal(t.model, 'sonnet');
      assert.equal(t.task_id, null);
    });
  });

  describe('addStep', () => {
    it('adds a step and updates metrics', () => {
      const t = createTrajectory({ sessionId: 's1', agentType: 'dev' });
      addStep(t, { action_type: 'tool_call', tool_name: 'Read', success: true, duration_ms: 50 });
      assert.equal(t.steps.length, 1);
      assert.equal(t.steps[0].step_number, 1);
      assert.equal(t.metrics.tool_calls, 1);
      assert.equal(t.metrics.total_duration_ms, 50);
    });

    it('increments error count on failure', () => {
      const t = createTrajectory({ sessionId: 's1', agentType: 'dev' });
      addStep(t, { action_type: 'tool_call', success: false, error_category: 'timeout' });
      assert.equal(t.metrics.errors, 1);
      assert.equal(t.steps[0].error_category, 'timeout');
    });

    it('truncates long summaries', () => {
      const t = createTrajectory({ sessionId: 's1', agentType: 'dev' });
      addStep(t, { action_type: 'observation', success: true, input_summary: 'x'.repeat(500) });
      assert.ok(t.steps[0].input_summary.length <= 200);
    });
  });

  describe('finalizeTrajectory', () => {
    it('sets outcome and end time', () => {
      const t = createTrajectory({ sessionId: 's1', agentType: 'dev' });
      finalizeTrajectory(t, 'success', { tokens_used: 5000 });
      assert.equal(t.outcome, 'success');
      assert.ok(t.ended_at);
      assert.equal(t.metrics.tokens_used, 5000);
    });
  });

  describe('normalizeSessionLog', () => {
    it('converts gap log entries to trajectory', () => {
      const entries = [
        { type: 'tool-call', tool: 'Read', description: 'Read file', context: 'src/index.js' },
        { type: 'error', description: 'Timeout', errorCategory: 'timeout' },
        { type: 'task-spawn', description: 'Spawned QA' },
      ];
      const t = normalizeSessionLog(entries, 'sess-1', 'router');
      assert.equal(t.steps.length, 3);
      assert.equal(t.steps[0].action_type, 'tool_call');
      assert.equal(t.steps[1].action_type, 'error');
      assert.equal(t.steps[1].success, false);
      assert.equal(t.steps[2].action_type, 'task_spawn');
      assert.equal(t.metrics.errors, 1);
    });
  });
});
