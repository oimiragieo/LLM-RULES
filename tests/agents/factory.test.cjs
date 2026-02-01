/**
 * Agent Factory Tests
 * ===================
 *
 * Verifies the Agent Factory's ability to:
 * 1. Create instances of all specialized agents.
 * 2. Pass configuration correctly.
 * 3. Handle invalid agent types.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it } = require('node:test');

// Robust import
const factoryPath = path.join(__dirname, '../../.claude/lib/agents/factory.cjs');
const { AgentFactory } = require(factoryPath);

describe('AgentFactory', () => {
  it('should create a DeveloperAgent', () => {
    const agent = AgentFactory.createAgent('developer', { tools: {} });
    assert.strictEqual(agent.name, 'DeveloperAgent');
  });

  it('should create an ArchitectAgent', () => {
    const agent = AgentFactory.createAgent('architect');
    assert.strictEqual(agent.name, 'ArchitectAgent');
  });

  it('should create a QAAgent', () => {
    const agent = AgentFactory.createAgent('qa');
    assert.strictEqual(agent.name, 'QAAgent');
  });

  it('should pass configuration to the agent', () => {
    const config = {
      tools: { myTool: () => {} },
      model: { name: 'test-model' },
    };
    const agent = AgentFactory.createAgent('developer', config);

    assert.ok(agent.tools.myTool, 'Tools should be passed');
    assert.strictEqual(agent.modelConfig.name, 'test-model', 'Model config should be passed');
  });

  it('should throw error for unknown agent types', () => {
    assert.throws(() => {
      AgentFactory.createAgent('chef');
    }, /Unknown agent type: chef/);
  });
});
