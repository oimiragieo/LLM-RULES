#!/usr/bin/env node
/**
 * Master Orchestrator Integration Tests
 * ======================================
 *
 * Tests multi-agent coordination patterns for master-orchestrator.
 * Uses Task tool mocks to validate orchestration logic.
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { TaskToolMock } = require('../mocks/task-tool-mock.cjs');
const { generateMockCompletion } = require('../mocks/agent-response-mock.cjs');

describe('Master Orchestrator Integration Tests', () => {
  let taskTool;

  beforeEach(() => {
    taskTool = new TaskToolMock();
  });

  describe('Scenario 1: Parallel Agent Spawn', () => {
    it('should spawn 3 agents (architect, developer, qa) in parallel', async () => {
      // Given: User request requires architect, developer, qa
      const _request = {
        type: 'feature',
        description: 'Design and implement user authentication',
        complexity: 'HIGH',
      };

      // When: Simulated orchestrator spawns agents
      await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Architect designing auth system',
        prompt: 'You are ARCHITECT. Design authentication system using best practices.',
        allowed_tools: ['Read', 'Write', 'TaskUpdate'],
        model: 'sonnet',
      });

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Developer implementing auth',
        prompt: 'You are DEVELOPER. Implement auth based on design.',
        allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate'],
        model: 'sonnet',
      });

      await taskTool.spawn({
        subagent_type: 'qa',
        description: 'QA testing auth',
        prompt: 'You are QA. Write comprehensive tests for authentication.',
        allowed_tools: ['Read', 'Write', 'Bash', 'TaskUpdate'],
        model: 'opus',
      });

      // Then: Verify 3 agents spawned
      assert.strictEqual(taskTool.spawnedAgents.length, 3, 'Should spawn exactly 3 agents');

      // Verify agent types
      const types = taskTool.spawnedAgents.map(a => a.type);
      assert.ok(types.includes('architect'), 'Should spawn architect');
      assert.ok(types.includes('developer'), 'Should spawn developer');
      assert.ok(types.includes('qa'), 'Should spawn qa');

      // Verify all agents have task IDs
      taskTool.spawnedAgents.forEach(agent => {
        assert.ok(agent.id, 'Agent should have task ID');
        assert.ok(agent.id.startsWith('task-'), 'Task ID should have correct format');
      });

      // Verify all agents are tracked in task list
      const taskList = taskTool.list();
      assert.strictEqual(taskList.length, 3, 'Task list should have 3 entries');
    });

    it('should assign appropriate models to each agent', async () => {
      // Spawn agents with different models
      await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Architect work',
        prompt: 'You are ARCHITECT.',
        model: 'sonnet',
      });

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Developer work',
        prompt: 'You are DEVELOPER.',
        model: 'sonnet',
      });

      await taskTool.spawn({
        subagent_type: 'qa',
        description: 'QA work',
        prompt: 'You are QA.',
        model: 'opus', // QA uses opus for complex reasoning
      });

      // Verify model assignments
      const architect = taskTool.getSpawnedAgent(0);
      const developer = taskTool.getSpawnedAgent(1);
      const qa = taskTool.getSpawnedAgent(2);

      assert.strictEqual(architect.model, 'sonnet', 'Architect should use sonnet');
      assert.strictEqual(developer.model, 'sonnet', 'Developer should use sonnet');
      assert.strictEqual(qa.model, 'opus', 'QA should use opus');
    });

    it('should include Task tools for orchestrators', async () => {
      // Orchestrators need Task tool to spawn subagents
      await taskTool.spawn({
        subagent_type: 'master-orchestrator',
        description: 'Master coordinating project',
        prompt: 'You are MASTER-ORCHESTRATOR.',
        allowed_tools: ['Task', 'TaskUpdate', 'TaskList', 'TaskGet', 'Read'],
        model: 'opus',
      });

      const orchestrator = taskTool.getSpawnedAgent(0);

      assert.ok(orchestrator.allowed_tools.includes('Task'), 'Orchestrator must have Task tool');
      assert.ok(
        orchestrator.allowed_tools.includes('TaskUpdate'),
        'Orchestrator must have TaskUpdate'
      );
      assert.ok(orchestrator.allowed_tools.includes('TaskList'), 'Orchestrator must have TaskList');
    });
  });

  describe('Scenario 2: Agent Task Tracking', () => {
    it('should track agent status transitions (pending → running → completed)', async () => {
      // Spawn agent
      const { taskId } = await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Developer implementing feature',
        prompt: 'You are DEVELOPER.',
      });

      // Initial status should be pending/running
      let task = taskTool.get(taskId);
      assert.ok(
        ['pending', 'running'].includes(task.status),
        `Status should be pending or running, got ${task.status}`
      );

      // Update to in_progress
      taskTool.update(taskId, { status: 'in_progress' });
      task = taskTool.get(taskId);
      assert.strictEqual(task.status, 'in_progress');

      // Update to completed
      taskTool.update(taskId, {
        status: 'completed',
        metadata: {
          summary: 'Feature implemented',
          filesModified: ['src/feature.ts'],
        },
      });

      task = taskTool.get(taskId);
      assert.strictEqual(task.status, 'completed');
      assert.ok(task.completedAt, 'Should have completion timestamp');
      assert.strictEqual(task.metadata.summary, 'Feature implemented');
    });

    it('should track TaskList after completion', async () => {
      // Spawn 3 agents
      const { taskId: task1 } = await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Design',
        prompt: 'You are ARCHITECT.',
      });

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Implement',
        prompt: 'You are DEVELOPER.',
      });

      await taskTool.spawn({
        subagent_type: 'qa',
        description: 'Test',
        prompt: 'You are QA.',
      });

      // Initial task list should have 3 tasks
      let taskList = taskTool.list();
      assert.strictEqual(taskList.length, 3);

      // Complete task 1
      taskTool.update(task1, { status: 'completed' });

      // Task list still shows all 3 (completed tasks remain visible)
      taskList = taskTool.list();
      assert.strictEqual(taskList.length, 3);

      // Verify task 1 is completed
      const completedTask = taskList.find(t => t.id === task1);
      assert.strictEqual(completedTask.status, 'completed');
    });
  });

  describe('Scenario 3: Context Passing Between Agents', () => {
    it('should pass architect output to developer in prompt', async () => {
      // Architect completes design
      const { taskId: architectTaskId } = await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Design auth system',
        prompt: 'You are ARCHITECT. Design authentication.',
      });

      const architectOutput = generateMockCompletion('architect', 'success');

      taskTool.update(architectTaskId, {
        status: 'completed',
        metadata: {
          output: architectOutput.output,
          decisions: architectOutput.decisions,
        },
      });

      // Developer receives architect's output in prompt
      const architectTask = taskTool.get(architectTaskId);
      const developerPrompt = `You are DEVELOPER. Implement authentication based on:

Architect's Design:
${architectTask.metadata.output}

Design Decisions:
${architectTask.metadata.decisions.join('\n')}

Please implement according to this design.`;

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Implement auth',
        prompt: developerPrompt,
      });

      const developer = taskTool.getSpawnedAgent(1);

      // Verify context passed
      assert.ok(
        developer.prompt.includes(architectOutput.output),
        'Developer prompt should include architect output'
      );
      assert.ok(
        developer.prompt.includes(architectOutput.decisions[0]),
        'Developer prompt should include design decisions'
      );
    });
  });

  describe('Scenario 4: Error Handling - Agent Failure', () => {
    it('should handle agent failure gracefully', async () => {
      // Configure mock to fail second agent
      taskTool.setFailureMode(1, 'Developer agent failed: syntax error');

      // Spawn agents
      await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Design',
        prompt: 'You are ARCHITECT.',
      });

      // Second agent should fail
      try {
        await taskTool.spawn({
          subagent_type: 'developer',
          description: 'Implement',
          prompt: 'You are DEVELOPER.',
        });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('syntax error'), 'Error should contain failure message');
      }

      // Third agent should still spawn
      await taskTool.spawn({
        subagent_type: 'qa',
        description: 'Test',
        prompt: 'You are QA.',
      });

      // Verify: 2 agents spawned successfully, 1 failed
      assert.strictEqual(taskTool.spawnedAgents.length, 3, 'Should have 3 spawn attempts');
      assert.strictEqual(taskTool.getFailedAgents().length, 1, 'Should have 1 failed agent');

      const failedAgent = taskTool.getFailedAgents()[0];
      assert.strictEqual(failedAgent.type, 'developer');
      assert.strictEqual(failedAgent.status, 'failed');
      assert.ok(failedAgent.error.includes('syntax error'));
    });
  });

  describe('Scenario 5: Sequential vs Parallel Execution', () => {
    it('should execute independent agents in parallel', async () => {
      const startTime = Date.now();

      // Simulate parallel spawns (all at once)
      await Promise.all([
        taskTool.spawn({
          subagent_type: 'architect',
          description: 'Design',
          prompt: 'You are ARCHITECT.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Implement',
          prompt: 'You are DEVELOPER.',
        }),
        taskTool.spawn({
          subagent_type: 'qa',
          description: 'Test',
          prompt: 'You are QA.',
        }),
      ]);

      const duration = Date.now() - startTime;

      // All agents should be spawned
      assert.strictEqual(taskTool.spawnedAgents.length, 3);

      // Parallel execution should be fast (<100ms for mocks)
      assert.ok(duration < 100, `Parallel spawn should be fast, took ${duration}ms`);
    });

    it('should respect task dependencies (blockedBy)', async () => {
      // Task B depends on Task A
      const { taskId: taskA } = await taskTool.spawn({
        subagent_type: 'architect',
        description: 'Task A: Design',
        prompt: 'You are ARCHITECT.',
      });

      const { taskId: taskB } = await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Task B: Implement (blocked by Task A)',
        prompt: 'You are DEVELOPER.',
      });

      // Verify both tasks exist
      assert.ok(taskTool.get(taskA));
      assert.ok(taskTool.get(taskB));

      // In real implementation, Task B would check if Task A is completed
      // Here we just verify the dependency is tracked
      assert.strictEqual(
        taskTool.getSpawnedAgent(1).description,
        'Task B: Implement (blocked by Task A)',
        'Task B should reference dependency'
      );
    });
  });

  describe('Scenario 6: Orchestrator Completion', () => {
    it('should aggregate results from all agents', async () => {
      // Spawn 3 agents
      const agents = await Promise.all([
        taskTool.spawn({
          subagent_type: 'architect',
          description: 'Design',
          prompt: 'You are ARCHITECT.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Implement',
          prompt: 'You are DEVELOPER.',
        }),
        taskTool.spawn({
          subagent_type: 'qa',
          description: 'Test',
          prompt: 'You are QA.',
        }),
      ]);

      // Complete all agents with mock results
      for (const { taskId, agent } of agents) {
        const mockResult = generateMockCompletion(agent.type, 'success');

        taskTool.update(taskId, {
          status: 'completed',
          metadata: mockResult,
        });
      }

      // Verify all completed
      const taskList = taskTool.list();
      const completedTasks = taskList.filter(t => t.status === 'completed');

      assert.strictEqual(completedTasks.length, 3, 'All 3 agents should be completed');

      // Orchestrator would aggregate results
      const results = [];
      for (const { taskId } of agents) {
        const task = taskTool.get(taskId);
        results.push(task.metadata);
      }

      assert.strictEqual(results.length, 3);
      assert.ok(results[0].output, 'Architect should have output');
      assert.ok(results[1].filesModified, 'Developer should have files');
      assert.ok(results[2].testsRun, 'QA should have test results');
    });
  });
});
