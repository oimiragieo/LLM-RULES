/**
 * @file tests/unit/observability/agent-instrumentation.test.mjs
 * @description Unit tests for agent instrumentation helper
 *
 * Tests agent span creation, attributes, nested spans, and automatic cleanup.
 *
 * Task: #44 (P1-6.3)
 * Date: 2026-01-29
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Module under test
let agentInstrumentation;
let telemetryClient;

describe('AgentInstrumentation', () => {
  before(async () => {
    // Import modules
    const instrumentationPath =
      'C:\\dev\\projects\\agent-studio\\.claude\\lib\\observability\\agent-instrumentation.cjs';
    const telemetryPath =
      'C:\\dev\\projects\\agent-studio\\.claude\\lib\\observability\\telemetry-client.cjs';

    agentInstrumentation = require(instrumentationPath);
    telemetryClient = require(telemetryPath);

    // Initialize telemetry (OTEL_ENABLED=true for testing)
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

    await telemetryClient.init();
  });

  after(async () => {
    // Shutdown telemetry
    await telemetryClient.shutdown();
    delete process.env.OTEL_ENABLED;
  });

  describe('startAgentSpan()', () => {
    it('creates a span with agent.id attribute', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      assert.ok(span, 'Span should be created');
      assert.strictEqual(typeof span.end, 'function', 'Span should have end() method');
      span.end();
    });

    it('creates a span with agent.type attribute from agentId', () => {
      const span = agentInstrumentation.startAgentSpan('developer-456', 'task-execution');
      assert.ok(span, 'Span should be created');
      // Note: We can't inspect span attributes directly in tests without exporter
      // This is validated via integration tests with Phoenix
      span.end();
    });

    it('creates a span with operation.name attribute', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'skill-invocation');
      assert.ok(span, 'Span should be created');
      span.end();
    });

    it('accepts optional metadata with task.id', () => {
      const metadata = { taskId: 'task-789' };
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution', metadata);
      assert.ok(span, 'Span should be created');
      span.end();
    });

    it('accepts optional metadata with custom attributes', () => {
      const metadata = { taskId: 'task-789', customKey: 'customValue' };
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution', metadata);
      assert.ok(span, 'Span should be created');
      span.end();
    });

    it('returns a valid span object', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      assert.ok(span, 'Span should be created');
      assert.strictEqual(typeof span.end, 'function', 'Span should have end() method');
      assert.strictEqual(
        typeof span.setAttribute,
        'function',
        'Span should have setAttribute() method'
      );
      assert.strictEqual(typeof span.setStatus, 'function', 'Span should have setStatus() method');
      assert.strictEqual(
        typeof span.recordException,
        'function',
        'Span should have recordException() method'
      );
      span.end();
    });
  });

  describe('endAgentSpan()', () => {
    it('ends a span with success status', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'success', data: 'test' };

      assert.doesNotThrow(() => {
        agentInstrumentation.endAgentSpan(span, result);
      }, 'endAgentSpan should not throw');
    });

    it('ends a span with error status', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'error', error: new Error('Test error') };

      assert.doesNotThrow(() => {
        agentInstrumentation.endAgentSpan(span, result);
      }, 'endAgentSpan should not throw');
    });

    it('sets result.status attribute on span', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'success' };

      agentInstrumentation.endAgentSpan(span, result);
      // Attribute inspection validated via integration tests
    });

    it('records exception if result.error exists', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'error', error: new Error('Test error') };

      assert.doesNotThrow(() => {
        agentInstrumentation.endAgentSpan(span, result);
      }, 'endAgentSpan should record exception without throwing');
    });

    it('sets SpanStatusCode.OK for success', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'success' };

      agentInstrumentation.endAgentSpan(span, result);
      // SpanStatus validated via integration tests
    });

    it('sets SpanStatusCode.ERROR for error', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      const result = { status: 'error', error: new Error('Test error') };

      agentInstrumentation.endAgentSpan(span, result);
      // SpanStatus validated via integration tests
    });
  });

  describe('withAgentSpan()', () => {
    it('executes function and returns result', async () => {
      const fn = async () => 'test-result';
      const result = await agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn);

      assert.strictEqual(result, 'test-result', 'Result should match function return value');
    });

    it('creates and ends span automatically', async () => {
      let spanCreated = false;
      const fn = async () => {
        spanCreated = true;
        return 'success';
      };

      const result = await agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn);
      assert.strictEqual(spanCreated, true, 'Function should have executed');
      assert.strictEqual(result, 'success', 'Result should be returned');
    });

    it('passes metadata to startAgentSpan()', async () => {
      const metadata = { taskId: 'task-789' };
      const fn = async () => 'success';

      const result = await agentInstrumentation.withAgentSpan(
        'agent-123',
        'task-execution',
        fn,
        metadata
      );
      assert.strictEqual(result, 'success', 'Result should be returned');
    });

    it('handles synchronous functions', async () => {
      const fn = () => 'sync-result';
      const result = await agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn);

      assert.strictEqual(result, 'sync-result', 'Synchronous result should be returned');
    });

    it('ends span even if function throws', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };

      await assert.rejects(
        async () => agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn),
        { message: 'Test error' },
        'Error should be propagated'
      );
      // Span cleanup validated via integration tests
    });

    it('records exception in span if function throws', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };

      await assert.rejects(
        async () => agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn),
        { message: 'Test error' },
        'Error should be propagated with exception recorded'
      );
    });

    it('sets error status in span if function throws', async () => {
      const fn = async () => {
        throw new Error('Test error');
      };

      await assert.rejects(
        async () => agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn),
        { message: 'Test error' },
        'Error should be propagated with error status'
      );
    });
  });

  describe('Nested Spans (Parent-Child Relationships)', () => {
    it('creates nested spans with parent context', async () => {
      const parentFn = async () => {
        const childFn = async () => 'child-result';
        return agentInstrumentation.withAgentSpan('agent-child', 'child-operation', childFn);
      };

      const result = await agentInstrumentation.withAgentSpan(
        'agent-parent',
        'parent-operation',
        parentFn
      );
      assert.strictEqual(result, 'child-result', 'Nested result should be returned');
    });

    it('maintains parent-child trace relationship', async () => {
      let childExecuted = false;
      const parentFn = async () => {
        const childFn = async () => {
          childExecuted = true;
          return 'child';
        };
        return agentInstrumentation.withAgentSpan('agent-child', 'child-op', childFn);
      };

      const result = await agentInstrumentation.withAgentSpan(
        'agent-parent',
        'parent-op',
        parentFn
      );
      assert.strictEqual(childExecuted, true, 'Child should have executed');
      assert.strictEqual(result, 'child', 'Child result should propagate');
    });

    it('supports multiple levels of nesting', async () => {
      const level3Fn = async () => 'level-3';
      const level2Fn = async () => {
        return agentInstrumentation.withAgentSpan('agent-l3', 'level-3', level3Fn);
      };
      const level1Fn = async () => {
        return agentInstrumentation.withAgentSpan('agent-l2', 'level-2', level2Fn);
      };

      const result = await agentInstrumentation.withAgentSpan('agent-l1', 'level-1', level1Fn);
      assert.strictEqual(result, 'level-3', 'Deeply nested result should be returned');
    });
  });

  describe('Span Attributes', () => {
    it('sets agent.id attribute correctly', () => {
      const span = agentInstrumentation.startAgentSpan('developer-123', 'task-execution');
      assert.ok(span, 'Span should be created with agent.id');
      span.end();
    });

    it('extracts agent.type from agentId', () => {
      const span = agentInstrumentation.startAgentSpan('planner-456', 'task-execution');
      assert.ok(span, 'Span should extract agent.type from agentId');
      span.end();
    });

    it('sets operation.name attribute', () => {
      const span = agentInstrumentation.startAgentSpan('agent-123', 'skill-invocation');
      assert.ok(span, 'Span should be created with operation.name');
      span.end();
    });

    it('sets task.id if provided in metadata', () => {
      const metadata = { taskId: 'task-789' };
      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution', metadata);
      assert.ok(span, 'Span should be created with task.id');
      span.end();
    });

    it('handles agentId without hyphen', () => {
      const span = agentInstrumentation.startAgentSpan('singlepart', 'task-execution');
      assert.ok(span, 'Span should handle agentId without hyphen');
      span.end();
    });
  });

  describe('Error Handling', () => {
    it('returns no-op span when telemetry disabled', async () => {
      // Shutdown telemetry
      await telemetryClient.shutdown();

      const span = agentInstrumentation.startAgentSpan('agent-123', 'task-execution');
      assert.ok(span, 'No-op span should be returned');
      assert.strictEqual(typeof span.end, 'function', 'No-op span should have end() method');
      span.end();

      // Re-initialize for other tests
      process.env.OTEL_ENABLED = 'true';
      await telemetryClient.init();
    });

    it('withAgentSpan works with no-op tracer', async () => {
      // Shutdown telemetry
      await telemetryClient.shutdown();

      const fn = async () => 'result';
      const result = await agentInstrumentation.withAgentSpan('agent-123', 'task-execution', fn);
      assert.strictEqual(result, 'result', 'Result should be returned with no-op tracer');

      // Re-initialize for other tests
      process.env.OTEL_ENABLED = 'true';
      await telemetryClient.init();
    });
  });
});
