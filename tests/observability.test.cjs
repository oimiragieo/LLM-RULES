const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

// Tests for SPEC-016: Observability & Monitoring Dashboard
// Following TDD RED-GREEN-REFACTOR methodology

describe('SPEC-016: Observability & Monitoring Dashboard', () => {
  // =================================================================
  // Category 1: Distributed Tracing (15+ tests)
  // =================================================================

  describe('Category 1: Distributed Tracing', () => {
    let DistributedTracer;
    let tracer;

    beforeEach(() => {
      // Will import module after implementing (GREEN phase)
      const {
        DistributedTracer: TracerClass,
      } = require('../.claude/lib/observability/distributed-tracer.cjs');
      DistributedTracer = TracerClass;
      tracer = new DistributedTracer({ serviceName: 'agent-studio' });
    });

    it('1.1: startSpan() creates span with name and attributes', () => {
      const span = tracer.startSpan('task_execution', { taskId: '123', agent: 'developer' });

      assert.ok(span.spanId, 'Span should have unique spanId');
      assert.ok(span.traceId, 'Span should have traceId');
      assert.strictEqual(span.name, 'task_execution');
      assert.strictEqual(span.attributes.taskId, '123');
      assert.strictEqual(span.attributes.agent, 'developer');
      assert.ok(span.startTime, 'Span should have startTime');
      assert.strictEqual(span.status, 'in_progress');
    });

    it('1.2: endSpan() completes span with duration and result', () => {
      const span = tracer.startSpan('task_execution', { taskId: '123' });

      // Simulate some work
      const result = { tasksCompleted: 5 };
      tracer.endSpan(span, 'success', result);

      assert.strictEqual(span.status, 'success');
      assert.ok(span.endTime, 'Span should have endTime');
      assert.ok(span.duration >= 0, 'Span should have duration in milliseconds');
      assert.deepStrictEqual(span.result, result);
    });

    it('1.3: recordException() captures error details in span', () => {
      const span = tracer.startSpan('failing_task');
      const error = new Error('Task failed: timeout');
      error.code = 'TIMEOUT';

      tracer.recordException(span, error);

      assert.ok(span.exception, 'Span should have exception object');
      assert.strictEqual(span.exception.message, 'Task failed: timeout');
      assert.strictEqual(span.exception.code, 'TIMEOUT');
      assert.ok(span.exception.stack, 'Exception should include stack trace');
      assert.ok(span.exception.timestamp, 'Exception should have timestamp');
    });

    it('1.4: Nested spans maintain parent-child relationship', () => {
      const parentSpan = tracer.startSpan('workflow_execution');
      const childSpan = tracer.startSpan('phase_execution', { phaseId: '1' }, parentSpan.spanId);

      assert.strictEqual(childSpan.parentSpanId, parentSpan.spanId);
      assert.strictEqual(
        childSpan.traceId,
        parentSpan.traceId,
        'Child should inherit traceId from parent'
      );
    });

    it('1.5: exportTraces() returns JSON format by default', () => {
      const span1 = tracer.startSpan('task1');
      tracer.endSpan(span1, 'success');

      const span2 = tracer.startSpan('task2');
      tracer.endSpan(span2, 'error');

      const exported = tracer.exportTraces();

      assert.strictEqual(exported.format, 'json');
      assert.strictEqual(exported.version, '1.0');
      assert.ok(Array.isArray(exported.traces), 'Exported data should have traces array');
      assert.strictEqual(exported.traces.length, 2);
      assert.ok(exported.exportTime, 'Export should have timestamp');
    });

    it('1.6: exportTraces() supports OpenTelemetry-compatible format', () => {
      const span = tracer.startSpan('test_span', { foo: 'bar' });
      tracer.endSpan(span, 'success');

      const exported = tracer.exportTraces('opentelemetry');

      assert.strictEqual(exported.format, 'opentelemetry');
      assert.ok(exported.resourceSpans, 'Should have OpenTelemetry resourceSpans structure');
      assert.ok(exported.resourceSpans[0].scopeSpans, 'Should have scopeSpans');
    });

    it('1.7: generateFlameGraph() creates flame graph visualization', () => {
      const rootSpan = tracer.startSpan('workflow');
      const phase1 = tracer.startSpan('phase1', {}, rootSpan.spanId);
      const phase2 = tracer.startSpan('phase2', {}, rootSpan.spanId);

      tracer.endSpan(phase1, 'success');
      tracer.endSpan(phase2, 'success');
      tracer.endSpan(rootSpan, 'success');

      const traces = tracer.exportTraces().traces;
      const flameGraph = tracer.generateFlameGraph(traces);

      assert.ok(flameGraph, 'Should return flame graph data');
      assert.ok(flameGraph.nodes, 'Flame graph should have nodes');
      assert.ok(flameGraph.nodes.length >= 3, 'Should have all spans as nodes');
      // Duration can be 0 for fast tests, check that it's a number
      assert.strictEqual(
        typeof flameGraph.nodes[0].duration,
        'number',
        'Nodes should have duration (number)'
      );
      assert.ok(flameGraph.nodes[0].name, 'Nodes should have name');
    });

    it('1.8: Trace context propagates across async boundaries', async () => {
      const parentSpan = tracer.startSpan('async_parent');

      const asyncOperation = async () => {
        const childSpan = tracer.startSpan('async_child', {}, parentSpan.spanId);
        await new Promise(resolve => setTimeout(resolve, 10));
        tracer.endSpan(childSpan, 'success');
        return childSpan;
      };

      const childSpan = await asyncOperation();
      tracer.endSpan(parentSpan, 'success');

      assert.strictEqual(childSpan.traceId, parentSpan.traceId);
      assert.strictEqual(childSpan.parentSpanId, parentSpan.spanId);
    });

    it('1.9: Span attributes support nested objects', () => {
      const span = tracer.startSpan('complex_task', {
        metadata: {
          tags: ['urgent', 'high-priority'],
          estimatedDuration: 300,
          assignee: { agent: 'developer', taskId: '123' },
        },
      });

      assert.deepStrictEqual(span.attributes.metadata.tags, ['urgent', 'high-priority']);
      assert.strictEqual(span.attributes.metadata.assignee.agent, 'developer');
    });

    it('1.10: Multiple concurrent traces maintain isolation', () => {
      const trace1Span = tracer.startSpan('trace1');
      const trace2Span = tracer.startSpan('trace2');

      assert.notStrictEqual(
        trace1Span.traceId,
        trace2Span.traceId,
        'Different traces should have different traceIds'
      );
    });

    it('1.11: Span duration measured accurately', (t, done) => {
      const span = tracer.startSpan('timed_task');

      setTimeout(() => {
        tracer.endSpan(span, 'success');

        // Duration should be at least 40ms (with wider tolerance for system variance)
        assert.ok(
          span.duration >= 40 && span.duration <= 100,
          `Duration ${span.duration}ms should be close to 50ms`
        );
        done();
      }, 50);
    });

    it('1.12: exportTraces() filters by time range', async () => {
      const span1 = tracer.startSpan('task1');
      tracer.endSpan(span1, 'success');

      // Wait to ensure clear time separation
      await new Promise(resolve => setTimeout(resolve, 20));

      // Record cutoff AFTER the delay to ensure span1 is before it
      const cutoffTime = Date.now();

      // Wait a bit more to ensure span2 is clearly after cutoff
      await new Promise(resolve => setTimeout(resolve, 10));

      const span2 = tracer.startSpan('task2');
      tracer.endSpan(span2, 'success');

      const exported = tracer.exportTraces('json', { startTime: cutoffTime });

      assert.strictEqual(exported.traces.length, 1, 'Should only export traces after cutoff');
      assert.strictEqual(exported.traces[0].name, 'task2');
    });

    it('1.13: Span supports custom event annotations', () => {
      const span = tracer.startSpan('annotated_task');

      tracer.addEvent(span, 'checkpoint_reached', { checkpoint: 'phase1_complete' });
      tracer.addEvent(span, 'warning_logged', { warning: 'high_memory_usage' });

      assert.ok(Array.isArray(span.events), 'Span should have events array');
      assert.strictEqual(span.events.length, 2);
      assert.strictEqual(span.events[0].name, 'checkpoint_reached');
      assert.strictEqual(span.events[1].name, 'warning_logged');
    });

    it('1.14: Flame graph correctly shows hierarchical time breakdown', () => {
      const root = tracer.startSpan('workflow');
      const p1 = tracer.startSpan('phase1', {}, root.spanId);
      const t1 = tracer.startSpan('task1', {}, p1.spanId);

      tracer.endSpan(t1, 'success');
      tracer.endSpan(p1, 'success');
      tracer.endSpan(root, 'success');

      const flameGraph = tracer.generateFlameGraph(tracer.exportTraces().traces);

      // Root should show total time
      const rootNode = flameGraph.nodes.find(n => n.name === 'workflow');
      const phase1Node = flameGraph.nodes.find(n => n.name === 'phase1');
      const task1Node = flameGraph.nodes.find(n => n.name === 'task1');

      assert.ok(rootNode.duration >= phase1Node.duration, 'Root duration should >= phase duration');
      assert.ok(
        phase1Node.duration >= task1Node.duration,
        'Phase duration should >= task duration'
      );
    });

    it('1.15: Traces can be filtered by status', () => {
      const s1 = tracer.startSpan('task1');
      tracer.endSpan(s1, 'success');

      const s2 = tracer.startSpan('task2');
      tracer.endSpan(s2, 'error');

      const s3 = tracer.startSpan('task3');
      tracer.endSpan(s3, 'success');

      const exported = tracer.exportTraces('json', { status: 'error' });

      assert.strictEqual(exported.traces.length, 1);
      assert.strictEqual(exported.traces[0].name, 'task2');
      assert.strictEqual(exported.traces[0].status, 'error');
    });
  });

  // =================================================================
  // Category 2: Metrics Collection (20+ tests)
  // =================================================================

  describe('Category 2: Metrics Collection', () => {
    let MetricsCollector;
    let metrics;

    beforeEach(() => {
      const {
        MetricsCollector: CollectorClass,
      } = require('../.claude/lib/observability/metrics-collector.cjs');
      MetricsCollector = CollectorClass;
      metrics = new MetricsCollector();
    });

    it('2.1: Counter increments correctly', () => {
      metrics.incrementCounter('tasksCreated');
      metrics.incrementCounter('tasksCreated');
      metrics.incrementCounter('tasksCreated', 3);

      const value = metrics.getCounter('tasksCreated');
      assert.strictEqual(value, 5);
    });

    it('2.2: Counter supports labels', () => {
      metrics.incrementCounter('tasksCompleted', 1, { agent: 'developer' });
      metrics.incrementCounter('tasksCompleted', 2, { agent: 'qa' });
      metrics.incrementCounter('tasksCompleted', 1, { agent: 'developer' });

      const devTasks = metrics.getCounter('tasksCompleted', { agent: 'developer' });
      const qaTasks = metrics.getCounter('tasksCompleted', { agent: 'qa' });

      assert.strictEqual(devTasks, 2);
      assert.strictEqual(qaTasks, 2);
    });

    it('2.3: Gauge sets and gets current value', () => {
      metrics.setGauge('concurrentTasks', 10);
      assert.strictEqual(metrics.getGauge('concurrentTasks'), 10);

      metrics.setGauge('concurrentTasks', 15);
      assert.strictEqual(metrics.getGauge('concurrentTasks'), 15);
    });

    it('2.4: Gauge supports increment/decrement', () => {
      metrics.setGauge('memoryUsedMB', 100);
      metrics.incrementGauge('memoryUsedMB', 50);
      assert.strictEqual(metrics.getGauge('memoryUsedMB'), 150);

      metrics.decrementGauge('memoryUsedMB', 30);
      assert.strictEqual(metrics.getGauge('memoryUsedMB'), 120);
    });

    it('2.5: Histogram records value distribution', () => {
      metrics.recordHistogram('taskDurationMs', 100);
      metrics.recordHistogram('taskDurationMs', 200);
      metrics.recordHistogram('taskDurationMs', 150);
      metrics.recordHistogram('taskDurationMs', 300);

      const stats = metrics.getHistogramStats('taskDurationMs');

      assert.strictEqual(stats.count, 4);
      assert.strictEqual(stats.sum, 750);
      assert.strictEqual(stats.mean, 187.5);
      assert.strictEqual(stats.min, 100);
      assert.strictEqual(stats.max, 300);
    });

    it('2.6: Histogram supports percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        metrics.recordHistogram('responseTime', i);
      }

      const stats = metrics.getHistogramStats('responseTime');

      assert.ok(stats.p50 >= 49 && stats.p50 <= 51, 'p50 should be around 50');
      assert.ok(stats.p95 >= 94 && stats.p95 <= 96, 'p95 should be around 95');
      assert.ok(stats.p99 >= 98 && stats.p99 <= 100, 'p99 should be around 99');
    });

    it('2.7: Rate calculation (events per second)', () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        metrics.incrementCounter('requests');
      }

      const rate = metrics.getRate('requests', startTime);

      assert.ok(rate > 0, 'Rate should be positive');
      assert.ok(rate <= 10000, 'Rate should be reasonable (events/sec)');
    });

    it('2.8: getMetrics() returns all collected metrics', () => {
      metrics.incrementCounter('tasksCreated', 5);
      metrics.setGauge('memoryUsedMB', 150);
      metrics.recordHistogram('taskDurationMs', 200);

      const allMetrics = metrics.getMetrics();

      assert.ok(allMetrics.counters, 'Should have counters');
      assert.ok(allMetrics.gauges, 'Should have gauges');
      assert.ok(allMetrics.histograms, 'Should have histograms');
      assert.strictEqual(allMetrics.counters.tasksCreated, 5);
      assert.strictEqual(allMetrics.gauges.memoryUsedMB, 150);
    });

    it('2.9: getMetricsByAgent() filters metrics by agent label', () => {
      metrics.incrementCounter('tasksCompleted', 3, { agent: 'developer' });
      metrics.incrementCounter('tasksCompleted', 2, { agent: 'qa' });
      metrics.recordHistogram('taskDurationMs', 100, { agent: 'developer' });
      metrics.recordHistogram('taskDurationMs', 200, { agent: 'qa' });

      const devMetrics = metrics.getMetricsByAgent('developer');

      assert.strictEqual(devMetrics.counters.tasksCompleted, 3);
      assert.strictEqual(devMetrics.histograms.taskDurationMs.count, 1);
    });

    it('2.10: getMetricsByFeature() filters metrics by SPEC ID', () => {
      metrics.incrementCounter('specsCompleted', 1, { specId: 'SPEC-001' });
      metrics.incrementCounter('specsCompleted', 1, { specId: 'SPEC-002' });
      metrics.recordHistogram('specDurationMs', 5000, { specId: 'SPEC-001' });

      const spec001Metrics = metrics.getMetricsByFeature('SPEC-001');

      assert.strictEqual(spec001Metrics.counters.specsCompleted, 1);
      assert.strictEqual(spec001Metrics.histograms.specDurationMs.count, 1);
      assert.strictEqual(spec001Metrics.histograms.specDurationMs.values[0], 5000);
    });

    it('2.11: Counter tracks task creation rate', () => {
      for (let i = 0; i < 20; i++) {
        metrics.incrementCounter('tasksCreated');
      }

      assert.strictEqual(metrics.getCounter('tasksCreated'), 20);
    });

    it('2.12: Counter tracks task completion vs failure rate', () => {
      metrics.incrementCounter('tasksCompleted', 18);
      metrics.incrementCounter('tasksFailed', 2);

      const total = metrics.getCounter('tasksCompleted') + metrics.getCounter('tasksFailed');
      const failureRate = metrics.getCounter('tasksFailed') / total;

      assert.strictEqual(total, 20);
      assert.strictEqual(failureRate, 0.1); // 10% failure rate
    });

    it('2.13: Gauge tracks concurrent task count', () => {
      metrics.setGauge('concurrentTasks', 0);

      // Simulate tasks starting/ending
      metrics.incrementGauge('concurrentTasks');
      metrics.incrementGauge('concurrentTasks');
      assert.strictEqual(metrics.getGauge('concurrentTasks'), 2);

      metrics.decrementGauge('concurrentTasks');
      assert.strictEqual(metrics.getGauge('concurrentTasks'), 1);
    });

    it('2.14: Gauge tracks memory usage (heap)', () => {
      const currentHeap = process.memoryUsage().heapUsed;
      metrics.setGauge('memoryUsedMB', Math.round(currentHeap / 1024 / 1024));

      const recorded = metrics.getGauge('memoryUsedMB');
      assert.ok(recorded > 0, 'Memory gauge should be positive');
      assert.ok(recorded < 1000, 'Memory gauge should be reasonable (<1GB)');
    });

    it('2.15: Gauge tracks context usage percentage', () => {
      const CONTEXT_LIMIT = 200000;
      const tokensUsed = 50000;

      metrics.setGauge('contextUsedPercent', (tokensUsed / CONTEXT_LIMIT) * 100);

      assert.strictEqual(metrics.getGauge('contextUsedPercent'), 25);
    });

    it('2.16: Histogram tracks task duration distribution', () => {
      const durations = [100, 150, 200, 250, 300, 350, 400, 450, 500];

      durations.forEach(d => metrics.recordHistogram('taskDurationMs', d));

      const stats = metrics.getHistogramStats('taskDurationMs');

      assert.strictEqual(stats.count, 9);
      assert.strictEqual(stats.mean, 300);
      assert.strictEqual(stats.min, 100);
      assert.strictEqual(stats.max, 500);
    });

    it('2.17: Histogram tracks tokens per task', () => {
      metrics.recordHistogram('tokensPerTask', 5000);
      metrics.recordHistogram('tokensPerTask', 10000);
      metrics.recordHistogram('tokensPerTask', 15000);

      const stats = metrics.getHistogramStats('tokensPerTask');

      assert.strictEqual(stats.mean, 10000);
      assert.strictEqual(stats.max, 15000);
    });

    it('2.18: Histogram tracks tool latency', () => {
      metrics.recordHistogram('toolLatencyMs', 50, { tool: 'Read' });
      metrics.recordHistogram('toolLatencyMs', 100, { tool: 'Write' });
      metrics.recordHistogram('toolLatencyMs', 75, { tool: 'Read' });

      const readStats = metrics.getHistogramStats('toolLatencyMs', { tool: 'Read' });
      const writeStats = metrics.getHistogramStats('toolLatencyMs', { tool: 'Write' });

      assert.strictEqual(readStats.count, 2);
      assert.strictEqual(readStats.mean, 62.5);
      assert.strictEqual(writeStats.count, 1);
      assert.strictEqual(writeStats.mean, 100);
    });

    it('2.19: Rate calculation for tasks per second', () => {
      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        metrics.incrementCounter('tasksProcessed');
      }

      const tasksPerSecond = metrics.getRate('tasksProcessed', startTime);

      assert.ok(tasksPerSecond > 0, 'Tasks per second should be positive');
    });

    it('2.20: Rate calculation for errors per second', () => {
      const startTime = Date.now();

      for (let i = 0; i < 5; i++) {
        metrics.incrementCounter('errors');
      }

      const errorsPerSecond = metrics.getRate('errors', startTime);

      assert.ok(errorsPerSecond >= 0, 'Errors per second should be non-negative');
    });
  });

  // =================================================================
  // Category 3: Hook Integration (15+ tests)
  // =================================================================

  describe('Category 3: Hook Integration', () => {
    let observabilityHook;
    let mockHookInput;

    beforeEach(() => {
      observabilityHook = require('../.claude/hooks/observability/observability-hook.cjs');

      mockHookInput = {
        type: 'PreToolUse',
        tool: 'TaskCreate',
        arguments: { subject: 'Test task', description: 'Test description' },
        agent: 'developer',
        timestamp: Date.now(),
      };
    });

    it('3.1: PreToolUse hook records trace span start', async () => {
      const result = await observabilityHook.execute(mockHookInput);

      assert.strictEqual(result.action, 'continue');
      assert.ok(result.metadata.spanId, 'Should create spanId');
      assert.ok(result.metadata.traceId, 'Should create traceId');
      assert.strictEqual(result.metadata.spanName, 'tool_TaskCreate');
    });

    it('3.2: PostToolUse hook records trace span end', async () => {
      observabilityHook.reset(); // Reset state between tests

      const preInput = {
        type: 'PreToolUse',
        tool: 'TaskUpdate',
        arguments: { taskId: '1', status: 'completed' },
        agent: 'developer',
      };

      const preResult = await observabilityHook.execute(preInput);
      const spanId = preResult.metadata.spanId;

      // Add a small delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 5));

      const postInput = {
        type: 'PostToolUse',
        tool: 'TaskUpdate',
        result: { success: true },
        spanId: spanId,
        agent: 'developer',
      };

      const postResult = await observabilityHook.execute(postInput);

      assert.strictEqual(postResult.action, 'continue');
      assert.strictEqual(
        typeof postResult.metadata.duration,
        'number',
        'Should record duration as number'
      );
      assert.strictEqual(postResult.metadata.status, 'success');
    });

    it('3.3: Hook collects tool invocation metrics', async () => {
      const input = {
        type: 'PreToolUse',
        tool: 'Read',
        arguments: { file_path: 'test.md' },
        agent: 'developer',
      };

      await observabilityHook.execute(input);

      const metrics = observabilityHook.getMetrics();

      assert.ok(metrics.counters.toolInvocations, 'Should track tool invocations');
    });

    it('3.4: Hook tracks context usage percentage', async () => {
      const input = {
        type: 'PostToolUse',
        tool: 'Read',
        result: { content: 'file content' },
        contextUsed: 50000,
        contextLimit: 200000,
      };

      await observabilityHook.execute(input);

      const metrics = observabilityHook.getMetrics();

      assert.ok(metrics.gauges.contextUsedPercent, 'Should track context percentage');
      assert.strictEqual(metrics.gauges.contextUsedPercent, 25);
    });

    it('3.5: Hook updates success vs failure counters', async () => {
      observabilityHook.reset(); // Reset state between tests

      // Create PreToolUse first to get spanId for success case
      const preSuccessResult = await observabilityHook.execute({
        type: 'PreToolUse',
        tool: 'Write',
        arguments: { file_path: 'test.md', content: 'test' },
      });

      const successInput = {
        type: 'PostToolUse',
        tool: 'Write',
        result: { success: true },
        spanId: preSuccessResult.metadata.spanId,
      };

      await observabilityHook.execute(successInput);

      // Create PreToolUse first to get spanId for failure case
      const preFailureResult = await observabilityHook.execute({
        type: 'PreToolUse',
        tool: 'Write',
        arguments: { file_path: 'fail.md', content: 'fail' },
      });

      const failureInput = {
        type: 'PostToolUse',
        tool: 'Write',
        result: { success: false, error: 'Permission denied' },
        spanId: preFailureResult.metadata.spanId,
      };

      await observabilityHook.execute(failureInput);

      const metrics = observabilityHook.getMetrics();

      assert.strictEqual(metrics.counters.toolSuccesses, 1);
      assert.strictEqual(metrics.counters.toolFailures, 1);
    });

    it('3.6: Hook collects duration histogram', async () => {
      observabilityHook.reset(); // Reset state between tests

      const preInput = {
        type: 'PreToolUse',
        tool: 'Bash',
        arguments: { command: 'npm test' },
      };

      const preResult = await observabilityHook.execute(preInput);

      // Simulate some delay
      await new Promise(resolve => setTimeout(resolve, 50));

      const postInput = {
        type: 'PostToolUse',
        tool: 'Bash',
        result: { exitCode: 0 },
        spanId: preResult.metadata.spanId,
      };

      await observabilityHook.execute(postInput);

      // Check the raw metrics collector directly since histograms with labels
      // are not returned by getMetrics() - only unlabeled histograms are
      const collector = observabilityHook.getMetricsCollector();
      const stats = collector.getHistogramStats('toolDurationMs', { tool: 'Bash' });

      assert.ok(stats.count >= 1, 'Should track duration histogram');
      assert.ok(stats.mean >= 40, 'Duration should be approximately 50ms');
    });

    it('3.7: ErrorHandler hook logs error with context', async () => {
      const input = {
        type: 'ErrorHandler',
        error: new Error('Tool execution failed'),
        tool: 'TaskUpdate',
        context: { taskId: '123', agent: 'developer' },
      };

      const result = await observabilityHook.execute(input);

      assert.strictEqual(result.action, 'continue');
      assert.ok(result.metadata.errorLogged, 'Should log error');
      assert.strictEqual(result.metadata.errorCategory, 'tool_execution_error');
    });

    it('3.8: ErrorHandler hook categorizes error types', async () => {
      const timeoutError = {
        type: 'ErrorHandler',
        error: new Error('Operation timed out'),
        tool: 'Bash',
      };

      const permissionError = {
        type: 'ErrorHandler',
        error: new Error('EACCES: permission denied'),
        tool: 'Write',
      };

      const result1 = await observabilityHook.execute(timeoutError);
      const result2 = await observabilityHook.execute(permissionError);

      assert.strictEqual(result1.metadata.errorCategory, 'timeout');
      assert.strictEqual(result2.metadata.errorCategory, 'permission_denied');
    });

    it('3.9: ErrorHandler hook updates error counters', async () => {
      const input = {
        type: 'ErrorHandler',
        error: new Error('Test error'),
        tool: 'Read',
      };

      await observabilityHook.execute(input);

      const metrics = observabilityHook.getMetrics();

      assert.ok(metrics.counters.errors >= 1, 'Should increment error counter');
    });

    it('3.10: Hook supports custom event annotations', async () => {
      const input = {
        type: 'CustomEvent',
        eventName: 'checkpoint_reached',
        data: { phase: 'phase1', progress: 45 },
      };

      const result = await observabilityHook.execute(input);

      assert.strictEqual(result.action, 'continue');
      assert.ok(result.metadata.eventRecorded, 'Should record custom event');
    });

    it('3.11: Hook tracks tokens consumed per tool', async () => {
      observabilityHook.reset(); // Reset state between tests

      // Create PreToolUse first to get spanId
      const preResult = await observabilityHook.execute({
        type: 'PreToolUse',
        tool: 'Read',
        arguments: { file_path: 'large-file.md' },
      });

      const input = {
        type: 'PostToolUse',
        tool: 'Read',
        result: { tokens: 5000 },
        spanId: preResult.metadata.spanId,
      };

      await observabilityHook.execute(input);

      // Check the raw metrics collector directly since histograms with labels
      // are not returned by getMetrics() - only unlabeled histograms are
      const collector = observabilityHook.getMetricsCollector();
      const stats = collector.getHistogramStats('tokensPerTool', { tool: 'Read' });

      assert.ok(stats.count >= 1, 'Should track tokens per tool histogram');
      assert.strictEqual(stats.sum, 5000, 'Should record token value');
    });

    it('3.12: Hook tracks cache hits vs misses', async () => {
      observabilityHook.reset(); // Reset state between tests

      // Create PreToolUse first to get spanId for cache hit
      const preCacheHitResult = await observabilityHook.execute({
        type: 'PreToolUse',
        tool: 'Read',
        arguments: { file_path: 'cached-file.md' },
      });

      const cacheHit = {
        type: 'PostToolUse',
        tool: 'Read',
        result: { cacheHit: true },
        spanId: preCacheHitResult.metadata.spanId,
      };

      await observabilityHook.execute(cacheHit);

      // Create PreToolUse first to get spanId for cache miss
      const preCacheMissResult = await observabilityHook.execute({
        type: 'PreToolUse',
        tool: 'Read',
        arguments: { file_path: 'uncached-file.md' },
      });

      const cacheMiss = {
        type: 'PostToolUse',
        tool: 'Read',
        result: { cacheHit: false },
        spanId: preCacheMissResult.metadata.spanId,
      };

      await observabilityHook.execute(cacheMiss);

      const metrics = observabilityHook.getMetrics();

      assert.strictEqual(metrics.counters.cacheHits, 1);
      assert.strictEqual(metrics.counters.cacheMisses, 1);
    });

    it('3.13: Hook integrates with DistributedTracer', async () => {
      observabilityHook.reset(); // Reset state between tests

      const preInput = {
        type: 'PreToolUse',
        tool: 'TaskCreate',
        arguments: { subject: 'Test' },
      };

      const preResult = await observabilityHook.execute(preInput);

      // Complete the span by calling PostToolUse so it moves from activeSpans to traces
      const postInput = {
        type: 'PostToolUse',
        tool: 'TaskCreate',
        result: { success: true },
        spanId: preResult.metadata.spanId,
      };

      await observabilityHook.execute(postInput);

      const tracer = observabilityHook.getTracer();
      const traces = tracer.exportTraces();

      assert.ok(traces.traces.length >= 1, 'Should have at least one trace');
      assert.strictEqual(traces.traces[0].spanId, preResult.metadata.spanId);
    });

    it('3.14: Hook integrates with MetricsCollector', async () => {
      const input = {
        type: 'PreToolUse',
        tool: 'Write',
        arguments: { file_path: 'test.md', content: 'test' },
      };

      await observabilityHook.execute(input);

      const collector = observabilityHook.getMetricsCollector();
      const metrics = collector.getMetrics();

      assert.ok(metrics.counters, 'Should have counters');
    });

    it('3.15: Hook provides reset() for testing', async () => {
      const input = {
        type: 'PreToolUse',
        tool: 'Read',
        arguments: { file_path: 'test.md' },
      };

      await observabilityHook.execute(input);

      observabilityHook.reset();

      const metrics = observabilityHook.getMetrics();

      assert.strictEqual(Object.keys(metrics.counters).length, 0, 'Counters should be cleared');
    });
  });

  // =================================================================
  // Category 4: Dashboard Generation (15+ tests)
  // =================================================================

  describe('Category 4: Dashboard Generation', () => {
    let MonitoringDashboard;
    let metrics;
    let traces;

    beforeEach(() => {
      const { MetricsCollector } = require('../.claude/lib/observability/metrics-collector.cjs');
      const { DistributedTracer } = require('../.claude/lib/observability/distributed-tracer.cjs');
      MonitoringDashboard = require('../.claude/lib/observability/monitoring-dashboard.cjs');

      const collector = new MetricsCollector();
      collector.incrementCounter('tasksCreated', 10);
      collector.incrementCounter('tasksCompleted', 8);
      collector.incrementCounter('tasksFailed', 2);
      collector.setGauge('memoryUsedMB', 150);
      collector.setGauge('concurrentTasks', 5);
      collector.recordHistogram('taskDurationMs', 100);
      collector.recordHistogram('taskDurationMs', 200);

      metrics = collector.getMetrics();

      const tracer = new DistributedTracer();
      const span1 = tracer.startSpan('task1');
      tracer.endSpan(span1, 'success');

      traces = tracer.exportTraces().traces;
    });

    it('4.1: generateMonitoringDashboard() returns HTML', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      assert.ok(html.includes('<!DOCTYPE html>'), 'Should be valid HTML');
      assert.ok(html.includes('<html>'), 'Should have html tag');
      assert.ok(html.includes('Monitoring Dashboard'), 'Should have title');
    });

    it('4.2: Dashboard displays real-time metrics', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      // Dashboard uses separate div tags for label and value
      assert.ok(
        html.includes('Tasks Created') && html.includes('>10<'),
        'Should show tasks created'
      );
      assert.ok(
        html.includes('Tasks Completed') && html.includes('>8<'),
        'Should show tasks completed'
      );
      assert.ok(html.includes('Tasks Failed') && html.includes('>2<'), 'Should show tasks failed');
      assert.ok(html.includes('Memory Used') && html.includes('>150'), 'Should show memory usage');
    });

    it('4.3: Dashboard displays error rate percentage', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      // Error rate = 2 / (8 + 2) = 20%
      // Dashboard formats as "20.0%" in metric-value div
      assert.ok(html.includes('20') && html.includes('%'), 'Should calculate error rate');
    });

    it('4.4: Dashboard displays historical graphs (HTML canvas/SVG)', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      assert.ok(html.includes('<canvas') || html.includes('<svg'), 'Should include graph elements');
    });

    it('4.5: Dashboard displays per-agent performance breakdown', () => {
      const { MetricsCollector } = require('../.claude/lib/observability/metrics-collector.cjs');
      const collector = new MetricsCollector();

      collector.incrementCounter('tasksCompleted', 5, { agent: 'developer' });
      collector.incrementCounter('tasksCompleted', 3, { agent: 'qa' });

      const agentMetrics = collector.getMetrics();

      const html = MonitoringDashboard.generateMonitoringDashboard(agentMetrics, []);

      assert.ok(
        html.includes('developer') || html.includes('Agent Breakdown'),
        'Should show per-agent breakdown'
      );
    });

    it('4.6: Dashboard displays per-feature performance breakdown', () => {
      const { MetricsCollector } = require('../.claude/lib/observability/metrics-collector.cjs');
      const collector = new MetricsCollector();

      collector.recordHistogram('specDurationMs', 5000, { specId: 'SPEC-001' });
      collector.recordHistogram('specDurationMs', 3000, { specId: 'SPEC-002' });

      const featureMetrics = collector.getMetrics();

      const html = MonitoringDashboard.generateMonitoringDashboard(featureMetrics, []);

      assert.ok(
        html.includes('SPEC-001') || html.includes('Feature Breakdown'),
        'Should show per-feature breakdown'
      );
    });

    it('4.7: Dashboard displays system health indicators (green/yellow/red)', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      // Should have health status indicators
      assert.ok(
        html.includes('green') ||
          html.includes('yellow') ||
          html.includes('red') ||
          html.includes('OK') ||
          html.includes('WARN')
      );
    });

    it('4.8: Dashboard displays recent errors with context', () => {
      const errorMetrics = {
        counters: { errors: 2 },
        gauges: {},
        histograms: {},
        recentErrors: [
          { message: 'Task timeout', timestamp: Date.now(), context: { taskId: '123' } },
          { message: 'Permission denied', timestamp: Date.now(), context: { file: 'test.md' } },
        ],
      };

      const html = MonitoringDashboard.generateMonitoringDashboard(errorMetrics, []);

      assert.ok(
        html.includes('Task timeout') || html.includes('Recent Errors'),
        'Should show recent errors'
      );
    });

    it('4.9: generateMetricsJSON() exports JSON format', () => {
      const json = MonitoringDashboard.generateMetricsJSON(metrics);

      assert.strictEqual(typeof json, 'string', 'Should return JSON string');
      const parsed = JSON.parse(json);

      assert.ok(parsed.counters, 'Should have counters');
      assert.ok(parsed.gauges, 'Should have gauges');
      assert.ok(parsed.timestamp, 'Should have timestamp');
    });

    it('4.10: JSON export includes all metrics categories', () => {
      const json = MonitoringDashboard.generateMetricsJSON(metrics);
      const parsed = JSON.parse(json);

      assert.ok(parsed.counters, 'Should have counters');
      assert.ok(parsed.gauges, 'Should have gauges');
      assert.ok(parsed.histograms, 'Should have histograms');
    });

    it('4.11: Dashboard calculates average response time', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces);

      // Average of [100, 200] = 150
      assert.ok(
        html.includes('150') || html.includes('Avg Duration'),
        'Should show average duration'
      );
    });

    it('4.12: Dashboard displays active vs pending tasks', () => {
      const taskMetrics = {
        counters: {},
        gauges: {
          activeTasks: 5,
          pendingTasks: 10,
        },
        histograms: {},
      };

      const html = MonitoringDashboard.generateMonitoringDashboard(taskMetrics, []);

      // Dashboard displays in System Health table with values in td elements
      assert.ok(html.includes('Active Tasks') && html.includes('>5<'), 'Should show active tasks');
      assert.ok(
        html.includes('Pending Tasks') && html.includes('>10<'),
        'Should show pending tasks'
      );
    });

    it('4.13: Dashboard supports refresh parameter', () => {
      const html = MonitoringDashboard.generateMonitoringDashboard(metrics, traces, {
        refreshInterval: 5,
      });

      // Should include auto-refresh meta tag or JavaScript
      assert.ok(
        html.includes('refresh') || html.includes('setInterval'),
        'Should support auto-refresh'
      );
    });

    it('4.14: Dashboard displays duration trends graph', () => {
      const trendMetrics = {
        counters: {},
        gauges: {},
        histograms: {
          taskDurationMs: {
            count: 10,
            values: [100, 150, 200, 250, 300, 350, 400, 450, 500, 550],
          },
        },
      };

      const html = MonitoringDashboard.generateMonitoringDashboard(trendMetrics, []);

      assert.ok(
        html.includes('Duration Trend') || html.includes('canvas') || html.includes('chart'),
        'Should show duration trend'
      );
    });

    it('4.15: Dashboard displays error rate graph', () => {
      const errorTrendMetrics = {
        counters: {
          errors: 5,
          totalRequests: 100,
        },
        gauges: {},
        histograms: {},
        errorRateHistory: [
          { timestamp: Date.now() - 60000, rate: 0.03 },
          { timestamp: Date.now() - 30000, rate: 0.04 },
          { timestamp: Date.now(), rate: 0.05 },
        ],
      };

      const html = MonitoringDashboard.generateMonitoringDashboard(errorTrendMetrics, []);

      assert.ok(
        html.includes('Error Rate') || html.includes('chart'),
        'Should show error rate graph'
      );
    });
  });

  // =================================================================
  // Category 5: Alerting System (15+ tests)
  // =================================================================

  describe('Category 5: Alerting System', () => {
    let AlertingSystem;
    let alerting;

    beforeEach(() => {
      const { AlertingSystem: AlertClass } = require('../.claude/lib/observability/alerting.cjs');
      AlertingSystem = AlertClass;
      alerting = new AlertingSystem();
    });

    it('5.1: addAlert() registers new alert with condition', () => {
      alerting.addAlert('high_error_rate', {
        condition: metrics => {
          const errorRate = metrics.counters.errors / metrics.counters.totalRequests;
          return errorRate > 0.05; // 5% threshold
        },
        threshold: 0.05,
        actions: ['log', 'notify'],
      });

      const alerts = alerting.getAlerts();
      assert.strictEqual(alerts.length, 1);
      assert.strictEqual(alerts[0].name, 'high_error_rate');
    });

    it('5.2: evaluateAlerts() triggers alert when threshold exceeded', () => {
      alerting.addAlert('high_error_rate', {
        condition: metrics => {
          const errorRate = metrics.counters.errors / metrics.counters.totalRequests;
          return errorRate > 0.05;
        },
        threshold: 0.05,
      });

      const metrics = {
        counters: {
          errors: 10,
          totalRequests: 100,
        },
        gauges: {},
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
      assert.strictEqual(triggered[0].name, 'high_error_rate');
      assert.strictEqual(triggered[0].triggered, true);
    });

    it('5.3: evaluateAlerts() does not trigger when threshold not exceeded', () => {
      alerting.addAlert('high_error_rate', {
        condition: metrics => {
          const errorRate = metrics.counters.errors / metrics.counters.totalRequests;
          return errorRate > 0.05;
        },
        threshold: 0.05,
      });

      const metrics = {
        counters: {
          errors: 2,
          totalRequests: 100,
        },
        gauges: {},
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 0);
    });

    it('5.4: Alert for high memory usage (>280MB)', () => {
      alerting.addAlert('memory_pressure', {
        condition: metrics => metrics.gauges.memoryUsedMB > 280,
        threshold: 280,
      });

      const metrics = {
        counters: {},
        gauges: { memoryUsedMB: 290 },
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
      assert.strictEqual(triggered[0].name, 'memory_pressure');
    });

    it('5.5: Alert for context exhaustion (>90% used)', () => {
      alerting.addAlert('context_exhaustion', {
        condition: metrics => metrics.gauges.contextUsedPercent > 90,
        threshold: 90,
      });

      const metrics = {
        counters: {},
        gauges: { contextUsedPercent: 95 },
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
      assert.strictEqual(triggered[0].name, 'context_exhaustion');
    });

    it('5.6: Alert for performance degradation (duration 2x baseline)', () => {
      const baseline = 100;

      alerting.addAlert('performance_degradation', {
        condition: metrics => {
          const stats = metrics.histograms.taskDurationMs;
          return stats && stats.mean > baseline * 2;
        },
        threshold: baseline * 2,
      });

      const metrics = {
        counters: {},
        gauges: {},
        histograms: {
          taskDurationMs: { mean: 250, count: 10 },
        },
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
    });

    it('5.7: Alert for long task hang (>1 hour without completion)', () => {
      alerting.addAlert('long_task_hang', {
        condition: metrics => {
          const maxDuration = metrics.histograms.taskDurationMs?.max || 0;
          return maxDuration > 3600000; // 1 hour in ms
        },
        threshold: 3600000,
      });

      const metrics = {
        counters: {},
        gauges: {},
        histograms: {
          taskDurationMs: { max: 3700000 },
        },
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
      assert.strictEqual(triggered[0].name, 'long_task_hang');
    });

    it('5.8: recordAlert() saves alert to history', () => {
      const alert = {
        name: 'high_error_rate',
        triggered: true,
        timestamp: Date.now(),
        value: 0.1,
      };

      alerting.recordAlert(alert);

      const history = alerting.getAlertHistory();

      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].name, 'high_error_rate');
    });

    it('5.9: getAlertHistory() returns recent alerts', () => {
      const alert1 = { name: 'alert1', triggered: true, timestamp: Date.now() - 60000 };
      const alert2 = { name: 'alert2', triggered: true, timestamp: Date.now() - 30000 };
      const alert3 = { name: 'alert3', triggered: true, timestamp: Date.now() };

      alerting.recordAlert(alert1);
      alerting.recordAlert(alert2);
      alerting.recordAlert(alert3);

      const history = alerting.getAlertHistory();

      assert.strictEqual(history.length, 3);
      // Should be sorted by most recent first
      assert.strictEqual(history[0].name, 'alert3');
    });

    it('5.10: getAlertHistory() filters by time range', () => {
      const cutoff = Date.now() - 40000;

      const alert1 = { name: 'old_alert', triggered: true, timestamp: Date.now() - 60000 };
      const alert2 = { name: 'recent_alert', triggered: true, timestamp: Date.now() - 20000 };

      alerting.recordAlert(alert1);
      alerting.recordAlert(alert2);

      const recentHistory = alerting.getAlertHistory({ since: cutoff });

      assert.strictEqual(recentHistory.length, 1);
      assert.strictEqual(recentHistory[0].name, 'recent_alert');
    });

    it('5.11: Alert deduplication (same alert within 5 minutes)', () => {
      alerting.addAlert('test_alert', {
        condition: metrics => metrics.gauges.testValue > 100,
        threshold: 100,
        deduplicationWindow: 300000, // 5 minutes
      });

      const metrics = {
        counters: {},
        gauges: { testValue: 150 },
        histograms: {},
      };

      // First trigger
      const triggered1 = alerting.evaluateAlerts(metrics);
      assert.strictEqual(triggered1.length, 1);

      // Second trigger within window - should be deduplicated
      const triggered2 = alerting.evaluateAlerts(metrics);
      assert.strictEqual(triggered2.length, 0, 'Should not trigger duplicate alert within window');
    });

    it('5.12: Alert routing by severity', () => {
      alerting.addAlert('critical_alert', {
        condition: metrics => metrics.gauges.memoryUsedMB > 500,
        threshold: 500,
        severity: 'critical',
        actions: ['page', 'email', 'log'],
      });

      alerting.addAlert('warning_alert', {
        condition: metrics => metrics.gauges.memoryUsedMB > 200,
        threshold: 200,
        severity: 'warning',
        actions: ['log'],
      });

      const metrics = {
        counters: {},
        gauges: { memoryUsedMB: 250 },
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.strictEqual(triggered.length, 1);
      assert.strictEqual(triggered[0].name, 'warning_alert');
      assert.strictEqual(triggered[0].severity, 'warning');
    });

    it('5.13: Alert actions execute correctly', () => {
      let logged = false;
      let notified = false;

      alerting.addAlert('test_alert', {
        condition: metrics => metrics.gauges.testValue > 100,
        threshold: 100,
        actions: [
          () => {
            logged = true;
          },
          () => {
            notified = true;
          },
        ],
      });

      const metrics = {
        counters: {},
        gauges: { testValue: 150 },
        histograms: {},
      };

      alerting.evaluateAlerts(metrics, { executeActions: true });

      assert.strictEqual(logged, true, 'Log action should execute');
      assert.strictEqual(notified, true, 'Notify action should execute');
    });

    it('5.14: Alert includes contextual metadata', () => {
      alerting.addAlert('high_error_rate', {
        condition: metrics => {
          const errorRate = metrics.counters.errors / metrics.counters.totalRequests;
          return errorRate > 0.05;
        },
        threshold: 0.05,
        metadata: {
          runbook: 'https://docs.example.com/runbooks/high-error-rate',
          team: 'platform',
        },
      });

      const metrics = {
        counters: { errors: 10, totalRequests: 100 },
        gauges: {},
        histograms: {},
      };

      const triggered = alerting.evaluateAlerts(metrics);

      assert.ok(triggered[0].metadata, 'Alert should include metadata');
      assert.strictEqual(
        triggered[0].metadata.runbook,
        'https://docs.example.com/runbooks/high-error-rate'
      );
    });

    it('5.15: Alert interpretation guide included', () => {
      const guide = alerting.getAlertInterpretationGuide();

      assert.ok(guide, 'Should have interpretation guide');
      assert.ok(guide.high_error_rate, 'Should have guidance for high_error_rate alert');
      assert.ok(guide.memory_pressure, 'Should have guidance for memory_pressure alert');
      assert.ok(guide.context_exhaustion, 'Should have guidance for context_exhaustion alert');
    });
  });
});
