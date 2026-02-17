/**
 * Tests for pipeline finalization routing policy
 *
 * RED: Failing tests for pipeline completion policy enforcement
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('Pipeline Finalization Routing', () => {
  let originalEnv;

  before(() => {
    originalEnv = { ...process.env };
  });

  after(() => {
    Object.assign(process.env, originalEnv);
  });

  it('should require finalization subagent task when pipeline reaches all phases complete', () => {
    // RED: This test should fail because the finalization detection logic doesn't exist yet
    const {
      checkAgentGuardrails,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const hookInput = {
      agent_type: 'router',
      session_id: 'test-session-finalization',
      context: {
        pipelinePhase: 'devops_complete',
        allPhasesComplete: true,
      },
    };

    const result = checkAgentGuardrails(hookInput, 'Task', {
      subagent_type: 'developer',
      task_id: 'task-test-1',
    });

    // Expected: Router should be warned/blocked from spawning non-finalization agents
    // when all phases are complete
    assert.ok(
      result.warning && result.warning.includes('finalization'),
      'Router should warn about missing finalization subagent'
    );
  });

  it('should block direct router-side git commit unless explicitly allowed by policy', () => {
    // RED: This test should fail because git commit blocking for router mode doesn't exist yet
    const {
      isGitCommitCommand,
      checkAgentGuardrails,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const hookInput = {
      agent_type: 'router',
      session_id: 'test-session-git',
      permission_mode: 'normal',
    };

    const command = 'git commit -m "feat: add feature"';

    // First verify git commit detection works
    assert.ok(isGitCommitCommand(command), 'Should detect git commit command');

    // Now test that router mode blocks git commits
    const result = checkAgentGuardrails(hookInput, 'Bash', { command });

    // Expected: Router should be blocked from running git commit directly
    assert.strictEqual(result.action, 'block', 'Router should be blocked from direct git commit');
    assert.ok(
      result.message && result.message.includes('git commit'),
      'Block message should mention git commit'
    );
  });

  it('should include finalization checklist items in router output', () => {
    // RED: This test should fail because finalization checklist doesn't exist yet
    // This will test the finalization-checklist.cjs module once created

    // Placeholder assertion - will implement after creating finalization-checklist.cjs
    assert.ok(true, 'Placeholder for finalization checklist test');
  });
});
