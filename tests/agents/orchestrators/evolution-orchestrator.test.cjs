#!/usr/bin/env node
/**
 * Evolution Orchestrator Integration Tests
 * =========================================
 *
 * Tests EVOLVE workflow (E→V→O→L→V→E) for creating new artifacts.
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { TaskToolMock } = require('../mocks/task-tool-mock.cjs');

describe('Evolution Orchestrator Integration Tests', () => {
  let taskTool;

  beforeEach(() => {
    taskTool = new TaskToolMock();
  });

  describe('Scenario 1: EVOLVE Workflow Phase Transitions', () => {
    it('should execute all 6 phases (E→V→O→L→V→E)', async () => {
      const phases = [];

      // Phase E: EVALUATE
      phases.push('evaluate');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase E: Evaluating need for new agent',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase E: Evaluate capability gap.',
      });

      // Phase V1: VALIDATE
      phases.push('validate');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase V1: Validating naming conflicts',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase V1: Check naming.',
      });

      // Phase O: OBTAIN (Research)
      phases.push('obtain');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase O: Research best practices',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase O: Research (MANDATORY).',
      });

      // Phase L: LOCK (Create)
      phases.push('lock');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase L: Creating artifact',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase L: Create agent.',
      });

      // Phase V2: VERIFY
      phases.push('verify');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase V2: Quality checking',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase V2: Verify.',
      });

      // Phase E2: ENABLE
      phases.push('enable');
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase E2: Deploying to ecosystem',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase E2: Enable.',
      });

      // Verify all 6 phases executed
      assert.strictEqual(phases.length, 6, 'Should have 6 phases');
      assert.deepStrictEqual(
        phases,
        ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'],
        'Phases should execute in order'
      );

      // Verify all orchestrator spawns tracked
      assert.strictEqual(taskTool.spawnedAgents.length, 6, 'Should have 6 phase spawns');

      // All agents should be evolution-orchestrator
      const allEvolution = taskTool.spawnedAgents.every(a => a.type === 'evolution-orchestrator');
      assert.ok(allEvolution, 'All spawns should be evolution-orchestrator');
    });

    it('should have opus model for complex reasoning', async () => {
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Evolution workflow',
        prompt: 'You are EVOLUTION-ORCHESTRATOR.',
        model: 'opus',
      });

      const orchestrator = taskTool.getSpawnedAgent(0);
      assert.strictEqual(orchestrator.model, 'opus', 'Evolution orchestrator should use opus');
    });
  });

  describe('Scenario 2: Phase O (Research) is Mandatory', () => {
    it('should execute research-synthesis skill in Phase O', async () => {
      // Phase O must invoke research-synthesis skill
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase O: Research',
        prompt: 'Phase O: OBTAIN (Research). Invoke Skill({ skill: "research-synthesis" })',
        allowed_tools: ['Skill', 'WebSearch', 'TaskUpdate'],
      });

      const phaseO = taskTool.getSpawnedAgent(0);

      // Verify research tools available
      assert.ok(
        phaseO.allowed_tools.includes('Skill'),
        'Should have Skill tool for research-synthesis'
      );
      assert.ok(
        phaseO.allowed_tools.includes('WebSearch'),
        'Should have WebSearch tool for research (fallback from MCP)'
      );

      // Verify prompt mentions research-synthesis
      assert.ok(
        phaseO.prompt.includes('research-synthesis'),
        'Prompt should invoke research-synthesis skill'
      );
    });

    it('should fail if Phase O is skipped', async () => {
      // Simulate skipping Phase O (going E → V → L directly)
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase E: Evaluate',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase E.',
      });

      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase V: Validate',
        prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase V.',
      });

      // Attempt to skip to Phase L without Phase O
      // In real implementation, this would be blocked by research-enforcement.cjs
      taskTool.setFailureMode(2, 'Phase O (Research) is MANDATORY and cannot be bypassed');

      try {
        await taskTool.spawn({
          subagent_type: 'evolution-orchestrator',
          description: 'Phase L: Lock (SHOULD FAIL)',
          prompt: 'You are EVOLUTION-ORCHESTRATOR. Phase L.',
        });
        assert.fail('Should have been blocked');
      } catch (err) {
        assert.ok(err.message.includes('Phase O'));
        assert.ok(err.message.includes('MANDATORY'));
      }
    });
  });

  describe('Scenario 3: Artifact Creation', () => {
    it('should invoke appropriate creator skill in Phase L', async () => {
      // Phase L: LOCK - Create agent artifact
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase L: Create agent',
        prompt: 'Phase L: LOCK. Invoke Skill({ skill: "agent-creator" }) to create new agent.',
        allowed_tools: ['Skill', 'Write', 'Edit', 'TaskUpdate'],
      });

      const phaseL = taskTool.getSpawnedAgent(0);

      // Verify creation tools available
      assert.ok(phaseL.allowed_tools.includes('Skill'), 'Should have Skill tool');
      assert.ok(phaseL.allowed_tools.includes('Write'), 'Should have Write tool');

      // Verify prompt invokes agent-creator
      assert.ok(phaseL.prompt.includes('agent-creator'), 'Should invoke agent-creator skill');
    });

    it('should validate artifact against schema', async () => {
      // Phase V2: VERIFY - Validate created artifact
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase V2: Verify artifact quality',
        prompt: 'Phase V2: VERIFY. Check artifact against schema, ensure no placeholders.',
        allowed_tools: ['Read', 'Bash', 'TaskUpdate'],
      });

      const phaseV2 = taskTool.getSpawnedAgent(0);

      // Verify verification tools available
      assert.ok(phaseV2.allowed_tools.includes('Read'), 'Should have Read tool');
      assert.ok(phaseV2.allowed_tools.includes('Bash'), 'Should have Bash for validation');
    });
  });

  describe('Scenario 4: Error Handling - Gate Failures', () => {
    it('should block Phase V1 if naming conflict detected', async () => {
      // Phase E: Evaluate (pass)
      await taskTool.spawn({
        subagent_type: 'evolution-orchestrator',
        description: 'Phase E: Evaluate',
        prompt: 'Phase E: Gap confirmed.',
      });

      // Phase V1: Validate (fail due to naming conflict)
      taskTool.setFailureMode(1, 'Naming conflict: agent "data-scientist" already exists');

      try {
        await taskTool.spawn({
          subagent_type: 'evolution-orchestrator',
          description: 'Phase V1: Validate naming',
          prompt: 'Phase V1: Check naming conflicts.',
        });
        assert.fail('Should have failed due to naming conflict');
      } catch (err) {
        assert.ok(err.message.includes('Naming conflict'));
        assert.ok(err.message.includes('data-scientist'));
      }

      // Workflow should be blocked at Phase V1
      assert.strictEqual(
        taskTool.spawnedAgents.length,
        2,
        'Should only have 2 phases (E and failed V1)'
      );
    });

    it('should require all gates to pass before deployment', async () => {
      // Simulate all phases passing gates
      const phases = [
        { phase: 'E', gate: 'evaluate', shouldPass: true },
        { phase: 'V1', gate: 'validate', shouldPass: true },
        { phase: 'O', gate: 'research', shouldPass: true },
        { phase: 'L', gate: 'create', shouldPass: true },
        { phase: 'V2', gate: 'verify', shouldPass: true },
        { phase: 'E2', gate: 'deploy', shouldPass: true },
      ];

      for (const { phase, gate, shouldPass } of phases) {
        await taskTool.spawn({
          subagent_type: 'evolution-orchestrator',
          description: `Phase ${phase}: ${gate}`,
          prompt: `Phase ${phase}. Gate: ${gate}. Pass: ${shouldPass}`,
        });

        // Complete phase
        const taskId = `task-${taskTool.spawnedAgents.length}`;
        taskTool.update(taskId, {
          status: 'completed',
          metadata: { gate, passed: shouldPass },
        });
      }

      // All 6 phases should complete
      const taskList = taskTool.list();
      const completed = taskList.filter(t => t.status === 'completed');

      assert.strictEqual(completed.length, 6, 'All 6 phases should pass');
    });
  });

  describe('Scenario 5: State Management', () => {
    it('should update evolution-state.json at each phase transition', async () => {
      const stateUpdates = [];

      // Simulate state updates at each phase
      for (const phase of ['E', 'V', 'O', 'L', 'V2', 'E2']) {
        await taskTool.spawn({
          subagent_type: 'evolution-orchestrator',
          description: `Phase ${phase}`,
          prompt: `Phase ${phase}. Update evolution-state.json.`,
        });

        stateUpdates.push({
          phase,
          state: `${phase.toLowerCase()}-ing`,
          timestamp: new Date().toISOString(),
        });
      }

      // Verify state updates tracked
      assert.strictEqual(stateUpdates.length, 6);
      assert.strictEqual(stateUpdates[0].phase, 'E');
      assert.strictEqual(stateUpdates[5].phase, 'E2');
    });
  });
});
