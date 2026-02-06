/**
 * RED Phase: Test for populate-agent-config script
 *
 * This test MUST FAIL first to prove we're testing the right thing.
 */

'use strict';

const { test } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const AGENT_CONFIG_PATH = path.join(PROJECT_ROOT, '.claude/config/agent-config.json');
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');

// Read both files once at module level
const agentConfig = JSON.parse(fs.readFileSync(AGENT_CONFIG_PATH, 'utf8'));
const agentRegistry = JSON.parse(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));

test('agent-config.json should have ALL 49 agents from registry', () => {
  const configAgents = Object.keys(agentConfig.agents || {});
  const registryAgents = Object.keys(agentRegistry.agents || {});

  // This test should FAIL initially (8 agents vs 49 agents)
  assert.strictEqual(
    configAgents.length,
    registryAgents.length,
    `Expected ${registryAgents.length} agents in agent-config.json, got ${configAgents.length}`
  );
});

test('each agent should have required fields (tools, model)', () => {
  const registryAgents = Object.keys(agentRegistry.agents || {});

  for (const agentId of registryAgents) {
    const agentData = agentConfig.agents[agentId];

    // This test should FAIL for missing agents
    assert.ok(agentData, `Agent "${agentId}" from registry missing in agent-config.json`);

    // Required fields
    assert.ok(
      Array.isArray(agentData.tools) && agentData.tools.length > 0,
      `Agent "${agentId}" missing tools array`
    );

    assert.ok(
      typeof agentData.model === 'string' && agentData.model.trim() !== '',
      `Agent "${agentId}" missing model field`
    );
  }
});

test('each agent model should match config.yaml or frontmatter precedence', () => {
  const { resolveAgentModel } = require('../../../.claude/lib/utils/agent-config-reader.cjs');
  const registryAgents = Object.keys(agentRegistry.agents || {});

  for (const agentId of registryAgents) {
    const agentData = agentConfig.agents[agentId];

    if (!agentData) continue; // Skip missing agents (handled by previous test)

    const resolved = resolveAgentModel(agentId, PROJECT_ROOT);

    // This test verifies model precedence is correctly applied
    assert.strictEqual(
      agentData.model,
      resolved.model,
      `Agent "${agentId}" has model "${agentData.model}" but should be "${resolved.model}" (source: ${resolved.source})`
    );
  }
});

test('each agent should have tools from registry capabilities or fallback', () => {
  const registryAgents = Object.keys(agentRegistry.agents || {});

  for (const agentId of registryAgents) {
    const agentData = agentConfig.agents[agentId];
    const registryData = agentRegistry.agents[agentId];

    if (!agentData) continue; // Skip missing agents

    // Check if tools are from registry or fallback
    const registryTools = registryData.capabilities?.[0]?.requiredTools || [];
    const fallbackTools = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'Skill',
    ];

    if (registryTools.length > 0) {
      // Should match registry tools
      assert.deepStrictEqual(
        agentData.tools.sort(),
        registryTools.sort(),
        `Agent "${agentId}" tools don't match registry`
      );
    } else {
      // Should have fallback tools
      assert.ok(
        fallbackTools.every(t => agentData.tools.includes(t)),
        `Agent "${agentId}" missing essential fallback tools`
      );
    }
  }
});
