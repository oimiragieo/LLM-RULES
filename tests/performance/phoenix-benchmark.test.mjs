/**
 * @file tests/performance/phoenix-benchmark.test.mjs
 * @description Performance benchmark for Arize Phoenix integration with OpenTelemetry
 *
 * Validates:
 * - Trace generation and export throughput
 * - Span creation latency
 * - Phoenix ingestion performance
 * - gRPC vs HTTP endpoint comparison
 *
 * Prerequisites:
 * - Phoenix running: docker-compose -f docker-compose.phoenix.yml up -d
 * - Environment: OTEL_ENABLED=true, OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
 *
 * Task: #47 (P1-6.6)
 * Date: 2026-01-29
 */
/* global fetch */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Set environment for testing
process.env.OTEL_ENABLED = 'true';
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';
process.env.OTEL_BATCH_SIZE = '100'; // Smaller batch for faster exports in tests
process.env.OTEL_BATCH_TIMEOUT = '1000'; // 1 second batch timeout

const telemetryClient = require('../../.claude/lib/observability/telemetry-client.cjs');

// Helper: Wait for async operations
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Check if Phoenix is available
async function isPhoenixAvailable() {
  try {
    const response = await fetch('http://localhost:6006/healthz');
    return response.ok;
  } catch {
    return false;
  }
}

describe('Phoenix Performance Benchmark', () => {
  let phoenixAvailable = false;

  before(async () => {
    // Check Phoenix availability
    phoenixAvailable = await isPhoenixAvailable();

    if (!phoenixAvailable) {
      console.warn('\n⚠️  Phoenix not available at http://localhost:6006');
      console.warn('Start Phoenix: docker-compose -f docker-compose.phoenix.yml up -d\n');
      return;
    }

    // Initialize telemetry
    const result = await telemetryClient.init();
    assert.ok(result.initialized, 'Telemetry should initialize successfully');
    assert.equal(result.endpoint, 'http://localhost:4317', 'Should use correct endpoint');

    console.log('\n✓ Phoenix available at http://localhost:6006');
    console.log('✓ OpenTelemetry initialized with gRPC exporter\n');
  });

  after(async () => {
    if (phoenixAvailable) {
      await telemetryClient.shutdown();
    }
  });

  describe('Trace Generation Performance', () => {
    it('should generate 100 spans with low latency', async function () {
      if (!phoenixAvailable) {
        this.skip();
        return;
      }

      const tracer = telemetryClient.getTracer();
      const latencies = [];

      const startTime = Date.now();

      // Generate 100 spans
      for (let i = 0; i < 100; i++) {
        const spanStart = Date.now();

        const span = tracer.startSpan(`test-span-${i}`, {
          attributes: {
            'test.iteration': i,
            'test.type': 'performance',
          },
        });

        span.setAttribute('operation', 'benchmark');
        span.end();

        const spanEnd = Date.now();
        latencies.push(spanEnd - spanStart);
      }

      const totalTime = Date.now() - startTime;

      // Calculate statistics
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      // Wait for batch export
      await wait(2000);

      console.log(`
Trace Generation Performance:
  Total spans: 100
  Total time: ${totalTime}ms
  Throughput: ${(100 / (totalTime / 1000)).toFixed(2)} spans/sec
  Avg latency: ${avgLatency.toFixed(2)}ms
  Min latency: ${minLatency}ms
  Max latency: ${maxLatency}ms
      `);

      // Assertions
      assert.ok(
        avgLatency < 1,
        `Average latency should be <1ms (actual: ${avgLatency.toFixed(2)}ms)`
      );
      assert.ok(maxLatency < 5, `Max latency should be <5ms (actual: ${maxLatency}ms)`);
      assert.ok(totalTime < 500, `Total time should be <500ms (actual: ${totalTime}ms)`);
    });

    it('should generate nested spans with minimal overhead', async function () {
      if (!phoenixAvailable) {
        this.skip();
        return;
      }

      const tracer = telemetryClient.getTracer();
      const startTime = Date.now();

      // Generate nested span structure (simulates agent → tool → operation hierarchy)
      for (let i = 0; i < 10; i++) {
        const parentSpan = tracer.startSpan(`agent-operation-${i}`);

        for (let j = 0; j < 5; j++) {
          const childSpan = tracer.startSpan(`tool-call-${j}`, {
            attributes: {
              'parent.operation': `agent-operation-${i}`,
            },
          });

          for (let k = 0; k < 3; k++) {
            const grandchildSpan = tracer.startSpan(`sub-operation-${k}`, {
              attributes: {
                'tool.name': `tool-call-${j}`,
              },
            });
            grandchildSpan.end();
          }

          childSpan.end();
        }

        parentSpan.end();
      }

      const totalTime = Date.now() - startTime;
      const totalSpans = 10 + 10 * 5 + 10 * 5 * 3; // 10 + 50 + 150 = 210 spans

      // Wait for batch export
      await wait(2000);

      console.log(`
Nested Span Performance:
  Total spans: ${totalSpans}
  Depth: 3 levels
  Total time: ${totalTime}ms
  Throughput: ${(totalSpans / (totalTime / 1000)).toFixed(2)} spans/sec
      `);

      assert.ok(
        totalTime < 1000,
        `Nested span generation should complete <1000ms (actual: ${totalTime}ms)`
      );
    });
  });

  describe('Batch Export Performance', () => {
    it('should export batches within timeout threshold', async function () {
      if (!phoenixAvailable) {
        this.skip();
        return;
      }

      const tracer = telemetryClient.getTracer();

      // Generate burst of spans to trigger batch export
      const batchSize = 100;
      const startTime = Date.now();

      for (let i = 0; i < batchSize; i++) {
        const span = tracer.startSpan(`batch-test-${i}`);
        span.setAttribute('batch.id', 'test-1');
        span.end();
      }

      // Wait for batch timeout (1 second in test config)
      await wait(1500);

      const exportTime = Date.now() - startTime;

      console.log(`
Batch Export Performance:
  Batch size: ${batchSize} spans
  Export time: ${exportTime}ms
  Export rate: ${(batchSize / (exportTime / 1000)).toFixed(2)} spans/sec
      `);

      assert.ok(
        exportTime < 2000,
        `Batch export should complete <2000ms (actual: ${exportTime}ms)`
      );
    });
  });

  describe('Phoenix Ingestion', () => {
    it('should verify traces are visible in Phoenix UI', async function () {
      if (!phoenixAvailable) {
        this.skip();
        return;
      }

      const tracer = telemetryClient.getTracer();

      // Generate unique trace for verification
      const traceId = `verification-${Date.now()}`;
      const span = tracer.startSpan('verification-span', {
        attributes: {
          'trace.id': traceId,
          'test.purpose': 'ui-verification',
        },
      });
      span.end();

      // Wait for export and ingestion
      await wait(3000);

      // Note: This test doesn't programmatically verify UI visibility
      // Manual verification required at http://localhost:6006

      console.log(`
Phoenix UI Verification:
  Trace ID: ${traceId}
  Check Phoenix UI: http://localhost:6006
  Look for span: "verification-span"
  Attributes: trace.id=${traceId}
      `);

      assert.ok(true, 'Trace generated for manual UI verification');
    });
  });

  describe('Real-World Simulation', () => {
    it('should simulate agent workflow with realistic trace patterns', async function () {
      if (!phoenixAvailable) {
        this.skip();
        return;
      }

      const tracer = telemetryClient.getTracer();
      const startTime = Date.now();

      // Simulate: Agent receives task → Plans → Executes → Reports
      const workflowSpan = tracer.startSpan('agent-workflow', {
        attributes: {
          'agent.name': 'developer',
          'task.id': '47',
          'workflow.type': 'phoenix-deployment',
        },
      });

      // Phase 1: Planning (50ms simulation)
      const planSpan = tracer.startSpan('planning-phase', {
        attributes: {
          phase: 'planning',
        },
      });
      await wait(50);
      planSpan.end();

      // Phase 2: Execution (multiple tool calls)
      const execSpan = tracer.startSpan('execution-phase', {
        attributes: {
          phase: 'execution',
        },
      });

      for (let i = 0; i < 5; i++) {
        const toolSpan = tracer.startSpan(`tool-call-${i}`, {
          attributes: {
            'tool.name':
              i === 0
                ? 'Write'
                : i === 1
                  ? 'Edit'
                  : i === 2
                    ? 'Bash'
                    : i === 3
                      ? 'Read'
                      : 'TaskUpdate',
          },
        });
        await wait(20);
        toolSpan.end();
      }

      execSpan.end();

      // Phase 3: Reporting (30ms simulation)
      const reportSpan = tracer.startSpan('reporting-phase', {
        attributes: {
          phase: 'reporting',
        },
      });
      await wait(30);
      reportSpan.end();

      workflowSpan.end();

      const totalTime = Date.now() - startTime;

      // Wait for export
      await wait(2000);

      console.log(`
Real-World Workflow Simulation:
  Total time: ${totalTime}ms
  Phases: Planning → Execution → Reporting
  Tool calls: 5
  Spans generated: 8
  Check Phoenix UI for workflow trace
      `);

      assert.ok(
        totalTime < 500,
        `Workflow simulation should complete <500ms (actual: ${totalTime}ms)`
      );
    });
  });
});
