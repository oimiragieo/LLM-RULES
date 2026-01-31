#!/usr/bin/env node
/**
 * Swarm Coordinator Integration Tests
 * ====================================
 *
 * Tests swarm coordination patterns (Queen/Worker topology).
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { TaskToolMock } = require('../mocks/task-tool-mock.cjs');
const { _generateMockCompletion } = require('../mocks/agent-response-mock.cjs');

describe('Swarm Coordinator Integration Tests', () => {
  let taskTool;

  beforeEach(() => {
    taskTool = new TaskToolMock();
  });

  describe('Scenario 1: Work Distribution to Workers', () => {
    it('should distribute 5 tasks to 3 worker agents', async () => {
      // Given: 5 files to refactor
      const files = [
        'src/file1.ts',
        'src/file2.ts',
        'src/file3.ts',
        'src/file4.ts',
        'src/file5.ts',
      ];

      // When: Swarm coordinator spawns workers (simulated)
      // Worker 1 gets files 1-2
      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 1: Refactor files 1-2',
        prompt: `You are WORKER 1. Refactor: ${files.slice(0, 2).join(', ')}`,
      });

      // Worker 2 gets files 3-4
      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 2: Refactor files 3-4',
        prompt: `You are WORKER 2. Refactor: ${files.slice(2, 4).join(', ')}`,
      });

      // Worker 3 gets file 5
      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 3: Refactor file 5',
        prompt: `You are WORKER 3. Refactor: ${files[4]}`,
      });

      // Then: Verify 3 workers spawned
      assert.strictEqual(taskTool.spawnedAgents.length, 3, 'Should spawn 3 workers');

      // Verify work distribution
      const worker1 = taskTool.getSpawnedAgent(0);
      const worker2 = taskTool.getSpawnedAgent(1);
      const worker3 = taskTool.getSpawnedAgent(2);

      assert.ok(worker1.prompt.includes('file1.ts'), 'Worker 1 should have file1');
      assert.ok(worker2.prompt.includes('file3.ts'), 'Worker 2 should have file3');
      assert.ok(worker3.prompt.includes('file5.ts'), 'Worker 3 should have file5');
    });

    it('should spawn workers in parallel for performance', async () => {
      const startTime = Date.now();

      // Spawn 5 workers simultaneously
      await Promise.all([
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 1',
          prompt: 'You are WORKER 1.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 2',
          prompt: 'You are WORKER 2.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 3',
          prompt: 'You are WORKER 3.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 4',
          prompt: 'You are WORKER 4.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 5',
          prompt: 'You are WORKER 5.',
        }),
      ]);

      const duration = Date.now() - startTime;

      assert.strictEqual(taskTool.spawnedAgents.length, 5);
      assert.ok(duration < 100, `Parallel spawn should be fast, took ${duration}ms`);
    });
  });

  describe('Scenario 2: Result Aggregation', () => {
    it('should aggregate results from all workers', async () => {
      // Spawn 3 workers
      const workers = await Promise.all([
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 1',
          prompt: 'Refactor file1.ts',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 2',
          prompt: 'Refactor file2.ts',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 3',
          prompt: 'Refactor file3.ts',
        }),
      ]);

      // Complete all workers
      for (const { taskId, agent } of workers) {
        taskTool.update(taskId, {
          status: 'completed',
          metadata: {
            filesModified: [`file${agent.prompt.match(/file(\d+)/)[1]}.ts`],
            linesChanged: 50,
          },
        });
      }

      // Aggregate results
      const results = [];
      for (const { taskId } of workers) {
        const task = taskTool.get(taskId);
        results.push(task.metadata);
      }

      assert.strictEqual(results.length, 3);
      assert.strictEqual(
        results.reduce((sum, r) => sum + r.linesChanged, 0),
        150,
        'Total lines changed should be 150'
      );
    });
  });

  describe('Scenario 3: Worker Failure Handling', () => {
    it('should continue when one worker fails', async () => {
      // Configure mock to fail worker 2
      taskTool.setFailureMode(1, 'Worker 2 failed: file not found');

      // Spawn workers
      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 1',
        prompt: 'You are WORKER 1.',
      });

      try {
        await taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 2',
          prompt: 'You are WORKER 2.',
        });
        assert.fail('Should have failed');
      } catch (err) {
        assert.ok(err.message.includes('file not found'));
      }

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 3',
        prompt: 'You are WORKER 3.',
      });

      // Verify: 2 workers succeeded, 1 failed
      assert.strictEqual(taskTool.spawnedAgents.length, 3);
      assert.strictEqual(taskTool.getFailedAgents().length, 1);
    });

    it('should provide partial results when some workers fail', async () => {
      // Spawn 3 workers, fail one
      taskTool.setFailureMode(1, 'Worker failure');

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 1',
        prompt: 'You are WORKER 1.',
      });

      try {
        await taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 2',
          prompt: 'You are WORKER 2.',
        });
      } catch (_err) {
        // Expected
      }

      await taskTool.spawn({
        subagent_type: 'developer',
        description: 'Worker 3',
        prompt: 'You are WORKER 3.',
      });

      // Complete successful workers
      taskTool.update('task-1', {
        status: 'completed',
        metadata: { success: true },
      });
      taskTool.update('task-3', {
        status: 'completed',
        metadata: { success: true },
      });

      // Check results
      const taskList = taskTool.list();
      const completed = taskList.filter(t => t.status === 'completed');

      assert.strictEqual(completed.length, 2, 'Should have 2 completed tasks');
    });
  });

  describe('Scenario 4: Consensus Voting', () => {
    it('should collect votes from all workers', async () => {
      // Spawn 3 workers for voting scenario
      const workers = await Promise.all([
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 1: Vote on approach A',
          prompt: 'You are WORKER 1. Evaluate approach A.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 2: Vote on approach A',
          prompt: 'You are WORKER 2. Evaluate approach A.',
        }),
        taskTool.spawn({
          subagent_type: 'developer',
          description: 'Worker 3: Vote on approach A',
          prompt: 'You are WORKER 3. Evaluate approach A.',
        }),
      ]);

      // Workers vote (2 for, 1 against)
      taskTool.update(workers[0].taskId, {
        status: 'completed',
        metadata: { vote: 'approve', rationale: 'Good approach' },
      });

      taskTool.update(workers[1].taskId, {
        status: 'completed',
        metadata: { vote: 'approve', rationale: 'Scalable design' },
      });

      taskTool.update(workers[2].taskId, {
        status: 'completed',
        metadata: {
          vote: 'reject',
          rationale: 'Performance concerns',
        },
      });

      // Tally votes
      const votes = [];
      for (const { taskId } of workers) {
        const task = taskTool.get(taskId);
        votes.push(task.metadata.vote);
      }

      const approveCount = votes.filter(v => v === 'approve').length;
      const rejectCount = votes.filter(v => v === 'reject').length;

      assert.strictEqual(approveCount, 2, 'Should have 2 approve votes');
      assert.strictEqual(rejectCount, 1, 'Should have 1 reject vote');
      assert.ok(approveCount > rejectCount, 'Consensus should be to approve');
    });
  });
});
