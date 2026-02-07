/**
 * Security Tests for spawn-prompt-validator.cjs
 * Tests SEC-TMPL-002: Orchestrator Spawn Validation Bypass
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Import the function under test
const { isOrchestratorSpawn } = require('../../.claude/hooks/safety/spawn-prompt-validator.cjs');

test('SEC-TMPL-002: isOrchestratorSpawn validation tests', async (t) => {
  await t.test('should return true for master-orchestrator subagent_type', () => {
    const toolInput = {
      subagent_type: 'master-orchestrator',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should detect master-orchestrator by subagent_type');
  });

  await t.test('should return true for router subagent_type', () => {
    const toolInput = {
      subagent_type: 'router',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should detect router as orchestrator type');
  });

  await t.test('should return false when description mentions orchestrator but subagent_type is developer', () => {
    const toolInput = {
      subagent_type: 'developer',
      description: 'Work with master-orchestrator to implement feature'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, false, 'Should NOT detect orchestrator from description alone');
  });

  await t.test('should return false for empty subagent_type', () => {
    const toolInput = {
      subagent_type: '',
      description: 'Description mentioning master-orchestrator'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, false, 'Should return false for empty subagent_type');
  });

  await t.test('should handle case-insensitive matching for MASTER-ORCHESTRATOR', () => {
    const toolInput = {
      subagent_type: 'MASTER-ORCHESTRATOR',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should handle uppercase subagent_type');
  });

  await t.test('should handle whitespace in subagent_type', () => {
    const toolInput = {
      subagent_type: '  router  ',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should handle whitespace in subagent_type');
  });

  await t.test('should return true for evolution-orchestrator', () => {
    const toolInput = {
      subagent_type: 'evolution-orchestrator',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should detect evolution-orchestrator');
  });

  await t.test('should return true for swarm-coordinator', () => {
    const toolInput = {
      subagent_type: 'swarm-coordinator',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should detect swarm-coordinator');
  });

  await t.test('should return true for party-orchestrator', () => {
    const toolInput = {
      subagent_type: 'party-orchestrator',
      description: 'Normal description'
    };

    const result = isOrchestratorSpawn(toolInput);
    assert.strictEqual(result, true, 'Should detect party-orchestrator');
  });
});
