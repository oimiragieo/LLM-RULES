/**
 * Event Types (P1-5.2)
 *
 * Defines 32+ event types across 6 categories with type-safe validation.
 * Used by EventBus for pub/sub and OpenTelemetry for tracing.
 *
 * Categories:
 * - AGENT: Agent lifecycle events
 * - TASK: Task state transitions
 * - TOOL: Tool invocations
 * - MEMORY: Memory operations
 * - LLM: LLM API calls
 * - MCP: Model Context Protocol events
 *
 * Usage:
 *   const { EventTypes, validateEvent } = require('.claude/lib/events/event-types.cjs');
 *   const result = validateEvent('AGENT_STARTED', { agentId: 'dev-123', ... });
 *   if (!result.valid) console.error(result.errors);
 */

'use strict';

// No external dependencies needed for event type definitions and validation

// ============================================================================
// Event Type Constants
// ============================================================================

/**
 * All event types (32+ across 6 categories)
 */
const EventTypes = {
  // Agent Events (6)
  AGENT_STARTED: 'AGENT_STARTED',
  AGENT_COMPLETED: 'AGENT_COMPLETED',
  AGENT_FAILED: 'AGENT_FAILED',
  AGENT_PAUSED: 'AGENT_PAUSED',
  AGENT_RESUMED: 'AGENT_RESUMED',
  AGENT_SPAWNED: 'AGENT_SPAWNED',

  // Task Events (7)
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_FAILED: 'TASK_FAILED',
  TASK_BLOCKED: 'TASK_BLOCKED',
  TASK_UNBLOCKED: 'TASK_UNBLOCKED',
  TASK_DELETED: 'TASK_DELETED',

  // Tool Events (5)
  TOOL_INVOKED: 'TOOL_INVOKED',
  TOOL_COMPLETED: 'TOOL_COMPLETED',
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_BLOCKED: 'TOOL_BLOCKED',
  TOOL_RETRIED: 'TOOL_RETRIED',

  // Memory Events (5)
  MEMORY_SAVED: 'MEMORY_SAVED',
  MEMORY_QUERIED: 'MEMORY_QUERIED',
  MEMORY_UPDATED: 'MEMORY_UPDATED',
  MEMORY_DELETED: 'MEMORY_DELETED',
  MEMORY_INDEXED: 'MEMORY_INDEXED',

  // LLM Events (4)
  LLM_CALLED: 'LLM_CALLED',
  LLM_COMPLETED: 'LLM_COMPLETED',
  LLM_FAILED: 'LLM_FAILED',
  LLM_CACHED: 'LLM_CACHED',

  // MCP Events (5)
  MCP_TOOL_DISCOVERED: 'MCP_TOOL_DISCOVERED',
  MCP_TOOL_INVOKED: 'MCP_TOOL_INVOKED',
  MCP_TOOL_COMPLETED: 'MCP_TOOL_COMPLETED',
  MCP_TOOL_FAILED: 'MCP_TOOL_FAILED',
  MCP_SERVER_CONNECTED: 'MCP_SERVER_CONNECTED',
};

/**
 * Event type categories for filtering/routing
 */
const AGENT_EVENTS = [
  'AGENT_STARTED',
  'AGENT_COMPLETED',
  'AGENT_FAILED',
  'AGENT_PAUSED',
  'AGENT_RESUMED',
  'AGENT_SPAWNED',
];

const TASK_EVENTS = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_FAILED',
  'TASK_BLOCKED',
  'TASK_UNBLOCKED',
  'TASK_DELETED',
];

const TOOL_EVENTS = [
  'TOOL_INVOKED',
  'TOOL_COMPLETED',
  'TOOL_FAILED',
  'TOOL_BLOCKED',
  'TOOL_RETRIED',
];

const MEMORY_EVENTS = [
  'MEMORY_SAVED',
  'MEMORY_QUERIED',
  'MEMORY_UPDATED',
  'MEMORY_DELETED',
  'MEMORY_INDEXED',
];

const LLM_EVENTS = ['LLM_CALLED', 'LLM_COMPLETED', 'LLM_FAILED', 'LLM_CACHED'];

const MCP_EVENTS = [
  'MCP_TOOL_DISCOVERED',
  'MCP_TOOL_INVOKED',
  'MCP_TOOL_COMPLETED',
  'MCP_TOOL_FAILED',
  'MCP_SERVER_CONNECTED',
];

// ============================================================================
// JSON Schema Validation
// ============================================================================

/**
 * Load and compile JSON Schema
 */

/**
 * Validate event against JSON Schema
 *
 * @param {string} eventType - Event type (e.g., 'AGENT_STARTED')
 * @param {object} payload - Event payload
 * @returns {{valid: boolean, errors?: array}} Validation result
 */
// eslint-disable-next-line complexity
function validateEvent(eventType, payload) {
  try {
    // Validate event type is known
    const allEventTypes = Object.values(EventTypes);
    if (!allEventTypes.includes(eventType)) {
      return {
        valid: false,
        errors: [{ path: '/type', message: `Unknown event type: ${eventType}` }],
      };
    }

    // Basic validation: type and timestamp required
    if (!payload.type) {
      return {
        valid: false,
        errors: [{ path: '/type', message: 'type is required' }],
      };
    }

    if (!payload.timestamp) {
      return {
        valid: false,
        errors: [{ path: '/timestamp', message: 'timestamp is required' }],
      };
    }

    // Validate timestamp format (ISO 8601)
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!isoDateRegex.test(payload.timestamp)) {
      return {
        valid: false,
        errors: [{ path: '/timestamp', message: 'timestamp must be ISO 8601 format' }],
      };
    }

    // Validate event-specific required fields
    const errors = [];

    // Agent events
    if (AGENT_EVENTS.includes(eventType)) {
      if (!payload.agentId)
        errors.push({ path: '/agentId', message: 'agentId is required for agent events' });
      if (!payload.agentType)
        errors.push({ path: '/agentType', message: 'agentType is required for agent events' });
      if (!payload.taskId)
        errors.push({ path: '/taskId', message: 'taskId is required for agent events' });

      if (eventType === 'AGENT_COMPLETED') {
        if (payload.duration === undefined)
          errors.push({ path: '/duration', message: 'duration is required' });
        if (payload.result === undefined)
          errors.push({ path: '/result', message: 'result is required' });
      }

      if (eventType === 'AGENT_FAILED') {
        if (!payload.error) errors.push({ path: '/error', message: 'error is required' });
      }
    }

    // Task events
    if (TASK_EVENTS.includes(eventType)) {
      if (!payload.taskId)
        errors.push({ path: '/taskId', message: 'taskId is required for task events' });

      if (eventType === 'TASK_CREATED') {
        if (!payload.subject) errors.push({ path: '/subject', message: 'subject is required' });
        if (!payload.description)
          errors.push({ path: '/description', message: 'description is required' });
      }

      if (eventType === 'TASK_UPDATED') {
        if (!payload.status) errors.push({ path: '/status', message: 'status is required' });
      }

      if (eventType === 'TASK_COMPLETED') {
        if (payload.result === undefined)
          errors.push({ path: '/result', message: 'result is required' });
        if (payload.duration === undefined)
          errors.push({ path: '/duration', message: 'duration is required' });
      }
    }

    // Tool events
    if (TOOL_EVENTS.includes(eventType)) {
      if (!payload.toolName)
        errors.push({ path: '/toolName', message: 'toolName is required for tool events' });

      if (eventType === 'TOOL_INVOKED') {
        if (payload.input === undefined)
          errors.push({ path: '/input', message: 'input is required' });
        if (!payload.agentId) errors.push({ path: '/agentId', message: 'agentId is required' });
        if (!payload.taskId) errors.push({ path: '/taskId', message: 'taskId is required' });
      }

      if (eventType === 'TOOL_COMPLETED') {
        if (payload.output === undefined)
          errors.push({ path: '/output', message: 'output is required' });
        if (payload.duration === undefined)
          errors.push({ path: '/duration', message: 'duration is required' });
      }

      if (eventType === 'TOOL_FAILED') {
        if (!payload.error) errors.push({ path: '/error', message: 'error is required' });
      }
    }

    // Memory events
    if (MEMORY_EVENTS.includes(eventType)) {
      if (eventType === 'MEMORY_SAVED') {
        if (!payload.key) errors.push({ path: '/key', message: 'key is required' });
        if (payload.value === undefined)
          errors.push({ path: '/value', message: 'value is required' });
        if (!payload.source) errors.push({ path: '/source', message: 'source is required' });
      }

      if (eventType === 'MEMORY_QUERIED') {
        if (!payload.query) errors.push({ path: '/query', message: 'query is required' });
        if (payload.results === undefined)
          errors.push({ path: '/results', message: 'results is required' });
        if (payload.latency === undefined)
          errors.push({ path: '/latency', message: 'latency is required' });
      }
    }

    // LLM events
    if (LLM_EVENTS.includes(eventType)) {
      if (!payload.model)
        errors.push({ path: '/model', message: 'model is required for LLM events' });

      if (eventType === 'LLM_CALLED') {
        if (payload.promptTokens === undefined)
          errors.push({ path: '/promptTokens', message: 'promptTokens is required' });
      }

      if (eventType === 'LLM_COMPLETED') {
        if (payload.completionTokens === undefined)
          errors.push({ path: '/completionTokens', message: 'completionTokens is required' });
        if (payload.totalTokens === undefined)
          errors.push({ path: '/totalTokens', message: 'totalTokens is required' });
        if (payload.latency === undefined)
          errors.push({ path: '/latency', message: 'latency is required' });
        if (payload.cost === undefined) errors.push({ path: '/cost', message: 'cost is required' });
      }
    }

    // MCP events
    if (MCP_EVENTS.includes(eventType)) {
      if (!payload.server)
        errors.push({ path: '/server', message: 'server is required for MCP events' });

      if (eventType === 'MCP_TOOL_DISCOVERED') {
        if (!payload.toolName) errors.push({ path: '/toolName', message: 'toolName is required' });
      }

      if (eventType === 'MCP_TOOL_INVOKED') {
        if (!payload.toolName) errors.push({ path: '/toolName', message: 'toolName is required' });
        if (payload.input === undefined)
          errors.push({ path: '/input', message: 'input is required' });
        if (!payload.agentId) errors.push({ path: '/agentId', message: 'agentId is required' });
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: [{ message: `Validation error: ${error.message}` }],
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  EventTypes,
  AGENT_EVENTS,
  TASK_EVENTS,
  TOOL_EVENTS,
  MEMORY_EVENTS,
  LLM_EVENTS,
  MCP_EVENTS,
  validateEvent,
};
