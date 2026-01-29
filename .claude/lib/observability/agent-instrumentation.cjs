/**
 * @file .claude/lib/observability/agent-instrumentation.cjs
 * @description Agent instrumentation helper for OpenTelemetry spans
 *
 * Provides helpers for creating and managing spans for agent operations.
 * Automatically sets span attributes for agent.id, agent.type, operation.name, task.id, and result.status.
 * Supports nested spans with parent-child relationships.
 *
 * Environment Variables:
 * - OTEL_ENABLED: Enable/disable OpenTelemetry (true|false, default: false)
 *
 * Task: #44 (P1-6.3)
 * Date: 2026-01-29
 */

const { SpanStatusCode } = require('@opentelemetry/api');
const telemetryClient = require('./telemetry-client.cjs');

/**
 * Start an agent operation span
 *
 * Creates a span with agent-specific attributes:
 * - agent.id: Full agent identifier
 * - agent.type: Agent type extracted from agentId (before hyphen)
 * - operation.name: Operation being performed
 * - task.id: Task ID (if provided in metadata)
 *
 * @param {string} agentId - Agent identifier (e.g., 'developer-123', 'planner-456')
 * @param {string} operation - Operation name (e.g., 'task-execution', 'skill-invocation')
 * @param {object} [metadata={}] - Optional metadata (taskId, custom attributes)
 * @returns {object} Span object with end(), setAttribute(), setStatus(), recordException() methods
 *
 * @example
 * const span = startAgentSpan('developer-123', 'task-execution', { taskId: 'task-789' });
 * // ... do work ...
 * span.end();
 */
function startAgentSpan(agentId, operation, metadata = {}) {
  const tracer = telemetryClient.getTracer();

  // Create span name
  const spanName = `agent.${operation}`;

  // Start span
  const span = tracer.startSpan(spanName);

  // Set agent attributes
  span.setAttribute('agent.id', agentId);

  // Extract agent type from agentId (before hyphen, or use full ID if no hyphen)
  const agentType = agentId.includes('-') ? agentId.split('-')[0] : agentId;
  span.setAttribute('agent.type', agentType);

  // Set operation name
  span.setAttribute('operation.name', operation);

  // Set task ID if provided
  if (metadata.taskId) {
    span.setAttribute('task.id', metadata.taskId);
  }

  // Set custom attributes from metadata (exclude taskId to avoid duplication)
  Object.keys(metadata).forEach(key => {
    if (key !== 'taskId') {
      span.setAttribute(key, metadata[key]);
    }
  });

  return span;
}

/**
 * End an agent operation span
 *
 * Sets result.status attribute and span status based on result.
 * Records exception if result.error exists.
 *
 * @param {object} span - Span object from startAgentSpan()
 * @param {object} result - Operation result with status and optional error
 * @param {string} result.status - Result status ('success' or 'error')
 * @param {Error} [result.error] - Error object (if status is 'error')
 *
 * @example
 * const span = startAgentSpan('developer-123', 'task-execution');
 * try {
 *   const result = await doWork();
 *   endAgentSpan(span, { status: 'success', data: result });
 * } catch (error) {
 *   endAgentSpan(span, { status: 'error', error });
 * }
 */
function endAgentSpan(span, result) {
  // Set result status attribute
  if (result && result.status) {
    span.setAttribute('result.status', result.status);
  }

  // Set span status based on result
  if (result && result.status === 'error') {
    // Record exception if error exists
    if (result.error) {
      span.recordException(result.error);
    }
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error?.message || 'Error' });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  // End span
  span.end();
}

/**
 * Execute a function within an agent span (automatic span management)
 *
 * Creates a span, executes the function, and automatically ends the span
 * with appropriate status. Handles both synchronous and asynchronous functions.
 *
 * @param {string} agentId - Agent identifier
 * @param {string} operation - Operation name
 * @param {function} fn - Function to execute (sync or async)
 * @param {object} [metadata={}] - Optional metadata (taskId, custom attributes)
 * @returns {Promise<*>} Function result
 *
 * @example
 * const result = await withAgentSpan('developer-123', 'task-execution', async () => {
 *   return await doWork();
 * }, { taskId: 'task-789' });
 */
async function withAgentSpan(agentId, operation, fn, metadata = {}) {
  const span = startAgentSpan(agentId, operation, metadata);

  try {
    // Execute function (handles both sync and async)
    const result = await Promise.resolve(fn());

    // End span with success status
    endAgentSpan(span, { status: 'success' });

    return result;
  } catch (error) {
    // End span with error status
    endAgentSpan(span, { status: 'error', error });

    // Re-throw error
    throw error;
  }
}

module.exports = {
  startAgentSpan,
  endAgentSpan,
  withAgentSpan,
};
