/**
 * Tests for pipeline phase gate after DevOps
 *
 * RED: Tests for finalization phase requirement after DevOps completion
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Pipeline Phase Gate', () => {
  it('should require finalization phase after DevOps success', () => {
    // RED: Test that finalization is required after all implementation/review/QA/DevOps phases
    const {
      checkAgentGuardrails,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const hookInput = {
      agent_type: 'router',
      session_id: 'test-session-devops-done',
      context: {
        pipelinePhase: 'devops',
        allPhasesComplete: true,
        completedPhases: ['design', 'implement', 'review', 'qa', 'devops'],
      },
    };

    // Router tries to spawn non-finalization agent after DevOps
    const result = checkAgentGuardrails(hookInput, 'Task', {
      subagent_type: 'developer',
      task_id: 'task-post-devops',
    });

    // Should warn about missing finalization
    assert.ok(result.checked, 'Should check pipeline phase gate');
    assert.ok(
      result.warning && result.warning.includes('finalization'),
      'Should warn about missing finalization phase'
    );
  });

  it('should allow finalization agents (qa, devops) after all phases complete', () => {
    // GREEN: Finalization agents should be allowed
    const {
      checkAgentGuardrails,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const hookInput = {
      agent_type: 'router',
      session_id: 'test-session-finalization',
      context: {
        pipelinePhase: 'finalization',
        allPhasesComplete: true,
      },
    };

    const qaResult = checkAgentGuardrails(hookInput, 'Task', {
      subagent_type: 'qa',
      task_id: 'task-finalize-qa',
    });

    // QA agent should not trigger warning (it's a finalization agent)
    assert.ok(
      !qaResult.warning || !qaResult.warning.includes('finalization'),
      'QA agent should not trigger finalization warning'
    );

    const devopsResult = checkAgentGuardrails(hookInput, 'Task', {
      subagent_type: 'devops',
      task_id: 'task-finalize-devops',
    });

    // DevOps agent should not trigger warning (it's a finalization agent)
    assert.ok(
      !devopsResult.warning || !devopsResult.warning.includes('finalization'),
      'DevOps agent should not trigger finalization warning'
    );
  });

  it('should mark pipeline incomplete if finalization is missing', () => {
    // Test that pipeline cannot be marked complete without finalization
    const {
      checkAgentGuardrails,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const hookInput = {
      agent_type: 'router',
      session_id: 'test-session-no-finalization',
      context: {
        pipelinePhase: 'devops',
        allPhasesComplete: true,
      },
    };

    // Attempting to complete without finalization should warn
    const result = checkAgentGuardrails(hookInput, 'Task', {
      subagent_type: 'technical-writer', // Not a finalization agent
      task_id: 'task-docs',
    });

    assert.ok(
      result.warning && result.warning.includes('finalization'),
      'Should warn when skipping finalization'
    );
  });
});
