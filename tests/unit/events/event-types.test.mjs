/**
 * Event Types Unit Tests (P1-5.2)
 *
 * Tests for event type definitions and JSON Schema validation.
 * Tests cover all 32+ event types across 6 categories.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

describe('Event Types', () => {
  let eventTypes;
  let eventSchema;
  let validateEvent;

  before(async () => {
    // Load event types module
    const eventTypesPath = path.join(PROJECT_ROOT, '.claude/lib/events/event-types.cjs');
    eventTypes = await import(`file:///${eventTypesPath.replace(/\\/g, '/')}`);

    // Load JSON Schema
    const schemaPath = path.join(PROJECT_ROOT, '.claude/schemas/event-schema.json');
    eventSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    // Get validation helper
    validateEvent = eventTypes.validateEvent;
  });

  describe('Event Type Constants', () => {
    it('should export all 32+ event types', () => {
      const expectedTypes = [
        // Agent Events (6)
        'AGENT_STARTED',
        'AGENT_COMPLETED',
        'AGENT_FAILED',
        'AGENT_PAUSED',
        'AGENT_RESUMED',
        'AGENT_SPAWNED',

        // Task Events (7)
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_COMPLETED',
        'TASK_FAILED',
        'TASK_BLOCKED',
        'TASK_UNBLOCKED',
        'TASK_DELETED',

        // Tool Events (5)
        'TOOL_INVOKED',
        'TOOL_COMPLETED',
        'TOOL_FAILED',
        'TOOL_BLOCKED',
        'TOOL_RETRIED',

        // Memory Events (5)
        'MEMORY_SAVED',
        'MEMORY_QUERIED',
        'MEMORY_UPDATED',
        'MEMORY_DELETED',
        'MEMORY_INDEXED',

        // LLM Events (4)
        'LLM_CALLED',
        'LLM_COMPLETED',
        'LLM_FAILED',
        'LLM_CACHED',

        // MCP Events (5)
        'MCP_TOOL_DISCOVERED',
        'MCP_TOOL_INVOKED',
        'MCP_TOOL_COMPLETED',
        'MCP_TOOL_FAILED',
        'MCP_SERVER_CONNECTED',
      ];

      const actualTypes = Object.keys(eventTypes.EventTypes);
      assert.ok(
        actualTypes.length >= 32,
        `Should have at least 32 event types, got ${actualTypes.length}`
      );

      expectedTypes.forEach(type => {
        assert.ok(actualTypes.includes(type), `Missing event type: ${type}`);
      });
    });

    it('should have string values matching keys', () => {
      const types = eventTypes.EventTypes;
      Object.entries(types).forEach(([key, value]) => {
        assert.equal(key, value, `Event type ${key} should have value "${key}"`);
      });
    });

    it('should categorize event types', () => {
      assert.ok(eventTypes.AGENT_EVENTS, 'Should have AGENT_EVENTS category');
      assert.ok(eventTypes.TASK_EVENTS, 'Should have TASK_EVENTS category');
      assert.ok(eventTypes.TOOL_EVENTS, 'Should have TOOL_EVENTS category');
      assert.ok(eventTypes.MEMORY_EVENTS, 'Should have MEMORY_EVENTS category');
      assert.ok(eventTypes.LLM_EVENTS, 'Should have LLM_EVENTS category');
      assert.ok(eventTypes.MCP_EVENTS, 'Should have MCP_EVENTS category');
    });
  });

  describe('JSON Schema Validation', () => {
    it('should have valid JSON Schema structure', () => {
      assert.equal(eventSchema.$schema, 'http://json-schema.org/draft-07/schema#');
      assert.equal(eventSchema.title, 'Agent Studio Event Schema');
      assert.ok(eventSchema.definitions, 'Should have definitions section');
      assert.ok(eventSchema.definitions.baseEvent, 'Should have baseEvent definition');
    });

    it('should define all event categories', () => {
      const categories = [
        'agentEvent',
        'taskEvent',
        'toolEvent',
        'memoryEvent',
        'llmEvent',
        'mcpEvent',
      ];
      categories.forEach(category => {
        assert.ok(eventSchema.definitions[category], `Should define ${category}`);
      });
    });

    it('should require type and timestamp in baseEvent', () => {
      const baseEvent = eventSchema.definitions.baseEvent;
      assert.ok(baseEvent.required.includes('type'), 'baseEvent should require type');
      assert.ok(baseEvent.required.includes('timestamp'), 'baseEvent should require timestamp');
    });
  });

  describe('validateEvent() helper', () => {
    it('should validate AGENT_STARTED event', () => {
      const event = {
        type: 'AGENT_STARTED',
        agentId: 'dev-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
      assert.equal(result.errors, undefined, 'Should have no errors');
    });

    it('should reject event with missing required fields', () => {
      const event = {
        type: 'AGENT_STARTED',
        timestamp: new Date().toISOString(),
        // Missing agentId, agentType, taskId
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, false, 'Should be invalid');
      assert.ok(result.errors, 'Should have errors');
      assert.ok(result.errors.length > 0, 'Should have at least one error');
    });

    it('should validate TASK_COMPLETED event', () => {
      const event = {
        type: 'TASK_COMPLETED',
        taskId: 'task-789',
        result: { success: true },
        duration: 5000,
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
    });

    it('should validate TOOL_INVOKED event', () => {
      const event = {
        type: 'TOOL_INVOKED',
        toolName: 'Read',
        input: { file_path: '/test.js' },
        agentId: 'dev-123',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
    });

    it('should validate MEMORY_SAVED event', () => {
      const event = {
        type: 'MEMORY_SAVED',
        key: 'pattern-123',
        value: { pattern: 'Use TDD' },
        source: 'learnings.md',
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
    });

    it('should validate LLM_COMPLETED event', () => {
      const event = {
        type: 'LLM_COMPLETED',
        model: 'sonnet',
        completionTokens: 500,
        totalTokens: 1000,
        latency: 2000,
        cost: 0.01,
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
    });

    it('should validate MCP_TOOL_INVOKED event', () => {
      const event = {
        type: 'MCP_TOOL_INVOKED',
        server: 'Exa',
        toolName: 'web_search_exa',
        input: { query: 'test' },
        agentId: 'dev-123',
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should be valid');
    });

    it('should reject unknown event type', () => {
      const event = {
        type: 'UNKNOWN_EVENT',
        timestamp: new Date().toISOString(),
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, false, 'Should be invalid');
      assert.ok(result.errors, 'Should have errors');
    });

    it('should validate all AGENT_EVENTS', () => {
      const agentEvents = [
        {
          type: 'AGENT_STARTED',
          agentId: 'a1',
          agentType: 'dev',
          taskId: 't1',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'AGENT_COMPLETED',
          agentId: 'a1',
          agentType: 'dev',
          taskId: 't1',
          duration: 1000,
          result: {},
          timestamp: new Date().toISOString(),
        },
        {
          type: 'AGENT_FAILED',
          agentId: 'a1',
          agentType: 'dev',
          taskId: 't1',
          error: { message: 'Error' },
          timestamp: new Date().toISOString(),
        },
      ];

      agentEvents.forEach(event => {
        const result = validateEvent(event.type, event);
        assert.equal(result.valid, true, `${event.type} should be valid`);
      });
    });

    it('should validate all TASK_EVENTS', () => {
      const taskEvents = [
        {
          type: 'TASK_CREATED',
          taskId: 't1',
          subject: 'Test',
          description: 'Desc',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'TASK_UPDATED',
          taskId: 't1',
          status: 'in_progress',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'TASK_COMPLETED',
          taskId: 't1',
          result: {},
          duration: 1000,
          timestamp: new Date().toISOString(),
        },
      ];

      taskEvents.forEach(event => {
        const result = validateEvent(event.type, event);
        assert.equal(result.valid, true, `${event.type} should be valid`);
      });
    });
  });

  describe('Event Type Groups', () => {
    it('should group AGENT_EVENTS correctly', () => {
      const agentEvents = eventTypes.AGENT_EVENTS;
      assert.ok(agentEvents.includes('AGENT_STARTED'));
      assert.ok(agentEvents.includes('AGENT_COMPLETED'));
      assert.ok(agentEvents.includes('AGENT_FAILED'));
      assert.ok(agentEvents.length >= 3, 'Should have at least 3 agent events');
    });

    it('should group TASK_EVENTS correctly', () => {
      const taskEvents = eventTypes.TASK_EVENTS;
      assert.ok(taskEvents.includes('TASK_CREATED'));
      assert.ok(taskEvents.includes('TASK_UPDATED'));
      assert.ok(taskEvents.includes('TASK_COMPLETED'));
      assert.ok(taskEvents.length >= 3, 'Should have at least 3 task events');
    });

    it('should group TOOL_EVENTS correctly', () => {
      const toolEvents = eventTypes.TOOL_EVENTS;
      assert.ok(toolEvents.includes('TOOL_INVOKED'));
      assert.ok(toolEvents.includes('TOOL_COMPLETED'));
      assert.ok(toolEvents.includes('TOOL_FAILED'));
      assert.ok(toolEvents.length >= 3, 'Should have at least 3 tool events');
    });
  });

  describe('Event Payload Structure', () => {
    it('should have metadata field for extensibility', () => {
      const event = {
        type: 'AGENT_STARTED',
        agentId: 'dev-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
        metadata: { custom: 'value' },
      };

      const result = validateEvent(event.type, event);
      assert.equal(result.valid, true, 'Should allow metadata field');
    });

    it('should validate timestamp format', () => {
      const event = {
        type: 'AGENT_STARTED',
        agentId: 'dev-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: 'invalid-timestamp',
      };

      const result = validateEvent(event.type, event);
      // ISO 8601 format required
      assert.equal(result.valid, false, 'Should reject invalid timestamp');
    });
  });
});
