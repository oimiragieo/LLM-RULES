/**
 * @file Observability Hook for Agent-Studio
 * @description Integrates distributed tracing and metrics collection into tool invocations
 * Part of SPEC-016: Observability & Monitoring Dashboard
 */

const { DistributedTracer } = require('../../lib/observability/distributed-tracer.cjs');
const { MetricsCollector } = require('../../lib/observability/metrics-collector.cjs');

// Singleton instances
const tracer = new DistributedTracer({ serviceName: 'agent-studio' });
const metrics = new MetricsCollector();

// Track active spans by tool invocation ID
const activeSpans = new Map();

/**
 * Execute observability hook
 * @param {object} input - Hook input
 * @returns {Promise<object>} Hook result
 */
async function execute(input) {
  const { type } = input;

  if (type === 'PreToolUse') {
    return handlePreToolUse(input);
  }

  if (type === 'PostToolUse') {
    return handlePostToolUse(input);
  }

  if (type === 'ErrorHandler') {
    return handleError(input);
  }

  if (type === 'CustomEvent') {
    return handleCustomEvent(input);
  }

  // Unknown type - pass through
  return { action: 'continue' };
}

/**
 * Handle PreToolUse event
 */
function handlePreToolUse(input) {
  const { tool, arguments: args, agent, timestamp } = input;

  // Start distributed trace span
  const spanName = `tool_${tool}`;
  const attributes = {
    tool,
    agent: agent || 'unknown',
    timestamp: timestamp || Date.now(),
  };

  const span = tracer.startSpan(spanName, attributes);
  activeSpans.set(span.spanId, span);

  // Increment tool invocation counter
  metrics.incrementCounter('toolInvocations', 1, { tool });
  metrics.incrementCounter('toolInvocations'); // Also track overall

  return {
    action: 'continue',
    metadata: {
      spanId: span.spanId,
      traceId: span.traceId,
      spanName,
      toolInvocations: metrics.getCounter('toolInvocations'),
    },
  };
}

/**
 * Handle PostToolUse event
 */
function handlePostToolUse(input) {
  const { tool, result, spanId, contextUsed, contextLimit } = input;

  // Find and end span
  if (spanId && activeSpans.has(spanId)) {
    const span = activeSpans.get(spanId);
    const status = result && result.success === false ? 'error' : 'success';

    tracer.endSpan(span, status, result);
    activeSpans.delete(spanId);

    // Record duration histogram
    metrics.recordHistogram('toolDurationMs', span.duration, { tool });

    // Update success/failure counters
    if (status === 'success') {
      metrics.incrementCounter('toolSuccesses', 1, { tool });
      metrics.incrementCounter('toolSuccesses'); // Overall counter
    } else {
      metrics.incrementCounter('toolFailures', 1, { tool });
      metrics.incrementCounter('toolFailures'); // Overall counter
    }

    // Track tokens if provided in result
    if (result && result.tokens) {
      metrics.recordHistogram('tokensPerTool', result.tokens, { tool });
    }

    // Track cache hits/misses
    if (result && typeof result.cacheHit === 'boolean') {
      if (result.cacheHit) {
        metrics.incrementCounter('cacheHits');
      } else {
        metrics.incrementCounter('cacheMisses');
      }
    }

    return {
      action: 'continue',
      metadata: {
        duration: span.duration,
        status,
      },
    };
  }

  // Track context usage if provided
  if (contextUsed && contextLimit) {
    const contextPercent = (contextUsed / contextLimit) * 100;
    metrics.setGauge('contextUsedPercent', contextPercent);
  }

  return { action: 'continue' };
}

/**
 * Handle error event
 */
function handleError(input) {
  const { error, tool, context } = input;

  // Categorize error
  const errorCategory = categorizeError(error);

  // Increment error counter
  metrics.incrementCounter('errors', 1, { category: errorCategory });
  metrics.incrementCounter('errors'); // Overall error counter

  // Record error in trace if span is active
  if (context && context.spanId && activeSpans.has(context.spanId)) {
    const span = activeSpans.get(context.spanId);
    tracer.recordException(span, error);
  }

  return {
    action: 'continue',
    metadata: {
      errorLogged: true,
      errorCategory,
    },
  };
}

/**
 * Handle custom event
 */
function handleCustomEvent(input) {
  const { eventName, data } = input;

  // Record custom event as counter
  metrics.incrementCounter(`customEvent_${eventName}`);

  return {
    action: 'continue',
    metadata: {
      eventRecorded: true,
      eventName,
    },
  };
}

/**
 * Categorize error by type
 */
function categorizeError(error) {
  if (!error || !error.message) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  if (message.includes('eacces') || message.includes('permission denied')) {
    return 'permission_denied';
  }

  if (message.includes('enoent') || message.includes('not found')) {
    return 'not_found';
  }

  if (message.includes('econnrefused') || message.includes('network')) {
    return 'network_error';
  }

  return 'tool_execution_error';
}

/**
 * Get metrics
 */
function getMetrics() {
  return metrics.getMetrics();
}

/**
 * Get tracer instance
 */
function getTracer() {
  return tracer;
}

/**
 * Get metrics collector instance
 */
function getMetricsCollector() {
  return metrics;
}

/**
 * Reset (for testing)
 */
function reset() {
  tracer.reset();
  metrics.reset();
  activeSpans.clear();
}

module.exports = {
  execute,
  getMetrics,
  getTracer,
  getMetricsCollector,
  reset,
};
