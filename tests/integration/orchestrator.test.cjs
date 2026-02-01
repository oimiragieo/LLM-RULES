/**
 * Orchestrator Integration Tests
 * ==============================
 *
 * Verifies that the Orchestrator correctly:
 * 1. Routes tasks to the correct agent type.
 * 2. Instantiates agents via Factory.
 * 3. Returns execution results.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

// Robust imports
const orchestratorPath = path.join(__dirname, '../../.claude/lib/agents/orchestrator.cjs');
const factoryPath = path.join(__dirname, '../../.claude/lib/agents/factory.cjs');

// Mock dependencies
const { OrchestratorService } = require(orchestratorPath);
const { AgentFactory } = require(factoryPath);

// Mock Agent classes to avoid complex side effects
class MockAgent {
  constructor(config) {
    this.config = config;
  }
  async resolveTask(_task) {
    return { status: 'mocked-success', agentName: this.constructor.name };
  }
}
class MockDeveloper extends MockAgent {}
class MockArchitect extends MockAgent {}
class MockQA extends MockAgent {}

describe('OrchestratorService Integration', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new OrchestratorService();

    // Spy/Mock Factory
    const _originalCreateAgent = AgentFactory.createAgent;
    AgentFactory.createAgent = (type, config) => {
      switch (type) {
        case 'developer':
          return new MockDeveloper(config);
        case 'architect':
          return new MockArchitect(config);
        case 'qa':
          return new MockQA(config);
        default:
          throw new Error(`Unknown: ${type}`);
      }
    };
  });

  // Restore mock after each test
  // (Node test runner handles this well if process restarts, but good practice)

  it('should route "Design login" to Architect', async () => {
    const result = await orchestrator.processTask('Design login');
    assert.strictEqual(result.agent, 'architect');
    assert.strictEqual(result.result.agentName, 'MockArchitect');
  });

  it('should route "verify" tasks to QA', async () => {
    const result = await orchestrator.processTask('Verify login feature', {
      changedFiles: ['login.js'],
    });
    assert.strictEqual(result.agent, 'qa');
    assert.strictEqual(result.result.agentName, 'MockQA');
  });

  it('should route "plan" tasks to Architect', async () => {
    const result = await orchestrator.processTask('Plan database schema');
    assert.strictEqual(result.agent, 'architect');
    assert.strictEqual(result.result.agentName, 'MockArchitect');
  });

  it('should route generic tasks to Developer', async () => {
    const result = await orchestrator.processTask('Fix bug in auth');
    assert.strictEqual(result.agent, 'developer');
    assert.strictEqual(result.result.agentName, 'MockDeveloper');
  });
});
