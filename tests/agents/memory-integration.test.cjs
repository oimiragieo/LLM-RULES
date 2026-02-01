/**
 * Memory Integration Verification (SPEC-034)
 * ==========================================
 *
 * Verifies that Agents receive the Memory instance from the Orchestrator.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach } = require('node:test');

const orchestratorPath = path.join(__dirname, '../../.claude/lib/agents/orchestrator.cjs');
const factoryPath = path.join(__dirname, '../../.claude/lib/agents/factory.cjs');
const baseAgentPath = path.join(__dirname, '../../.claude/lib/agents/base-agent.cjs');

const { OrchestratorService } = require(orchestratorPath);
const { AgentFactory } = require(factoryPath);
const { BaseAgent } = require(baseAgentPath);

// Mock Agent to inspect config
class SpyAgent extends BaseAgent {
  constructor(config) {
    super(config);
  }
  async resolveTask() {
    return { status: 'success' };
  }
}

describe('Memory Integration', () => {
  let orchestrator;
  let createdAgentConfig;

  beforeEach(() => {
    // Hijack Factory to spy on creation
    const _originalCreate = AgentFactory.createAgent;
    AgentFactory.createAgent = (type, config) => {
      createdAgentConfig = config;
      return new SpyAgent(config);
    };

    orchestrator = new OrchestratorService();
  });

  it('should pass context.memory to Agent', async () => {
    const mockMemory = { mock: 'memory-instance' };

    await orchestrator.processTask('Check memory', {
      memory: mockMemory,
    });

    assert.ok(createdAgentConfig, 'Agent should be created');
    assert.strictEqual(
      createdAgentConfig.memory,
      mockMemory,
      'Memory should be passed to Agent config'
    );
  });
});
