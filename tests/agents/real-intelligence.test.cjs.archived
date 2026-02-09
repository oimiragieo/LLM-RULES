/**
 * Real Intelligence Verification (SPEC-033)
 * =========================================
 *
 * Verifies that Agents now use the ModelClient for _think().
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it } = require('node:test');

const factoryPath = path.join(__dirname, '../../.claude/lib/agents/factory.cjs');
const { AgentFactory } = require(factoryPath);
const { ModelClient } = require(path.join(__dirname, '../../.claude/lib/clients/model-client.cjs'));

describe('Real Intelligence Integration', () => {
  it('should delegate _think to ModelClient', async () => {
    // 1. Create a custom ModelClient mock
    const mockClient = new ModelClient();
    mockClient.generateText = async () => 'Thinking with Portals';

    // 2. Create Agent with this client
    const developer = AgentFactory.createAgent('developer', {
      modelClient: mockClient,
    });

    // 3. Ask it to think
    // Note: DeveloperAgent.resolveTask calls _think internally,
    // but we can also call _think directly if exposed or via subclass
    // DeveloperAgent doesn't expose _think publicly, but we can access it on the instance
    // if we cast it (it's JS).

    const response = await developer._think('system', 'user');

    assert.strictEqual(response, 'Thinking with Portals');
  });

  it('should use default ModelClient (Mock Mode) when none provided', async () => {
    const architect = AgentFactory.createAgent('architect');

    // Architect uses _think for planning
    // We'll call _think directly to verify wiring, bypassing the complex resolveTask logic
    const response = await architect._think('system', 'make a plan');

    // Default MockClient returns JSON for "plan"
    assert.ok(
      response.includes('Mock Plan') || response.includes('ModelClient'),
      'Should use default MockClient'
    );
  });
});
