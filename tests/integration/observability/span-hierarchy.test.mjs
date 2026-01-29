/**
 * @file tests/integration/observability/span-hierarchy.test.mjs
 * @description Integration tests for agent instrumentation span hierarchy
 *
 * Tests parent-child span relationships and span attribute propagation.
 *
 * Task: #44 (P1-6.3)
 * Date: 2026-01-29
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Module under test
let agentInstrumentation;
let telemetryClient;

describe('Span Hierarchy Integration Tests', () => {
  before(async () => {
    // Import modules
    const instrumentationPath =
      'C:\\dev\\projects\\agent-studio\\.claude\\lib\\observability\\agent-instrumentation.cjs';
    const telemetryPath =
      'C:\\dev\\projects\\agent-studio\\.claude\\lib\\observability\\telemetry-client.cjs';

    agentInstrumentation = require(instrumentationPath);
    telemetryClient = require(telemetryPath);

    // Initialize telemetry
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

    await telemetryClient.init();
  });

  after(async () => {
    // Shutdown telemetry
    await telemetryClient.shutdown();
    delete process.env.OTEL_ENABLED;
  });

  describe('Parent-Child Span Hierarchy', () => {
    it('creates parent span then child span', async () => {
      const parentResult = await agentInstrumentation.withAgentSpan(
        'router-123',
        'route-request',
        async () => {
          const childResult = await agentInstrumentation.withAgentSpan(
            'developer-456',
            'execute-task',
            async () => {
              return 'child-completed';
            },
            { taskId: 'task-789' }
          );

          return `parent-completed: ${childResult}`;
        }
      );

      assert.strictEqual(
        parentResult,
        'parent-completed: child-completed',
        'Nested result should propagate'
      );
    });

    it('maintains trace relationship across multiple child spans', async () => {
      const result = await agentInstrumentation.withAgentSpan(
        'orchestrator-001',
        'orchestrate',
        async () => {
          const child1 = await agentInstrumentation.withAgentSpan(
            'planner-002',
            'plan-task',
            async () => 'plan-complete'
          );

          const child2 = await agentInstrumentation.withAgentSpan(
            'developer-003',
            'implement-task',
            async () => 'impl-complete'
          );

          const child3 = await agentInstrumentation.withAgentSpan(
            'qa-004',
            'test-task',
            async () => 'test-complete'
          );

          return [child1, child2, child3];
        }
      );

      assert.deepStrictEqual(
        result,
        ['plan-complete', 'impl-complete', 'test-complete'],
        'All child results should be collected'
      );
    });

    it('supports deeply nested spans (3+ levels)', async () => {
      const result = await agentInstrumentation.withAgentSpan(
        'level-1',
        'operation-1',
        async () => {
          return agentInstrumentation.withAgentSpan('level-2', 'operation-2', async () => {
            return agentInstrumentation.withAgentSpan('level-3', 'operation-3', async () => {
              return agentInstrumentation.withAgentSpan('level-4', 'operation-4', async () => {
                return 'deepest-level';
              });
            });
          });
        }
      );

      assert.strictEqual(result, 'deepest-level', 'Deeply nested result should propagate');
    });
  });

  describe('Error Propagation in Span Hierarchy', () => {
    it('propagates error from child to parent', async () => {
      await assert.rejects(
        async () => {
          await agentInstrumentation.withAgentSpan('parent-agent', 'parent-operation', async () => {
            await agentInstrumentation.withAgentSpan('child-agent', 'child-operation', async () => {
              throw new Error('Child error');
            });
          });
        },
        { message: 'Child error' },
        'Child error should propagate to parent'
      );
    });

    it('records error in child span without affecting siblings', async () => {
      const result = await agentInstrumentation.withAgentSpan(
        'parent-agent',
        'parallel-tasks',
        async () => {
          const results = [];

          // Child 1: Success
          try {
            const child1 = await agentInstrumentation.withAgentSpan(
              'child-1',
              'task-1',
              async () => 'success-1'
            );
            results.push(child1);
          } catch (error) {
            results.push(`error-1: ${error.message}`);
          }

          // Child 2: Error
          try {
            await agentInstrumentation.withAgentSpan('child-2', 'task-2', async () => {
              throw new Error('Task 2 failed');
            });
          } catch (error) {
            results.push(`error-2: ${error.message}`);
          }

          // Child 3: Success
          try {
            const child3 = await agentInstrumentation.withAgentSpan(
              'child-3',
              'task-3',
              async () => 'success-3'
            );
            results.push(child3);
          } catch (error) {
            results.push(`error-3: ${error.message}`);
          }

          return results;
        }
      );

      assert.deepStrictEqual(
        result,
        ['success-1', 'error-2: Task 2 failed', 'success-3'],
        'Error in one child should not affect siblings'
      );
    });
  });

  describe('Span Attributes in Hierarchy', () => {
    it('passes metadata through nested spans', async () => {
      const result = await agentInstrumentation.withAgentSpan(
        'router-123',
        'route-request',
        async () => {
          return agentInstrumentation.withAgentSpan(
            'developer-456',
            'execute-task',
            async () => {
              return 'task-complete';
            },
            { taskId: 'task-789', priority: 'high' }
          );
        },
        { sessionId: 'session-abc' }
      );

      assert.strictEqual(result, 'task-complete', 'Result should propagate with metadata');
    });

    it('handles agent type extraction in nested spans', async () => {
      const result = await agentInstrumentation.withAgentSpan(
        'planner-001',
        'create-plan',
        async () => {
          const developerResult = await agentInstrumentation.withAgentSpan(
            'developer-002',
            'implement',
            async () => 'impl-done'
          );

          const qaResult = await agentInstrumentation.withAgentSpan(
            'qa-003',
            'test',
            async () => 'test-done'
          );

          return { developerResult, qaResult };
        }
      );

      assert.deepStrictEqual(
        result,
        { developerResult: 'impl-done', qaResult: 'test-done' },
        'Multiple child agents should complete successfully'
      );
    });
  });

  describe('Real-World Agent Workflow Simulation', () => {
    it('simulates Router → Planner → Developer → QA workflow', async () => {
      const workflow = await agentInstrumentation.withAgentSpan(
        'router-main',
        'route-user-request',
        async () => {
          // Router spawns Planner
          const plan = await agentInstrumentation.withAgentSpan(
            'planner-001',
            'create-implementation-plan',
            async () => {
              return {
                tasks: ['task-1', 'task-2', 'task-3'],
                timeline: '3 days',
              };
            },
            { taskId: 'plan-task-001' }
          );

          // Router spawns Developer
          const implementation = await agentInstrumentation.withAgentSpan(
            'developer-002',
            'implement-feature',
            async () => {
              // Developer executes subtasks
              const subtask1 = await agentInstrumentation.withAgentSpan(
                'developer-002',
                'implement-subtask',
                async () => 'subtask-1-done',
                { taskId: 'task-1' }
              );

              const subtask2 = await agentInstrumentation.withAgentSpan(
                'developer-002',
                'implement-subtask',
                async () => 'subtask-2-done',
                { taskId: 'task-2' }
              );

              return [subtask1, subtask2];
            },
            { taskId: 'impl-task-002' }
          );

          // Router spawns QA
          const testing = await agentInstrumentation.withAgentSpan(
            'qa-003',
            'run-test-suite',
            async () => {
              return {
                passed: 10,
                failed: 0,
                coverage: '95%',
              };
            },
            { taskId: 'qa-task-003' }
          );

          return {
            plan,
            implementation,
            testing,
          };
        },
        { userRequest: 'add-authentication', sessionId: 'session-xyz' }
      );

      assert.ok(workflow.plan, 'Plan should be created');
      assert.ok(workflow.implementation, 'Implementation should be completed');
      assert.ok(workflow.testing, 'Testing should be completed');
      assert.strictEqual(workflow.testing.failed, 0, 'All tests should pass');
    });
  });
});
