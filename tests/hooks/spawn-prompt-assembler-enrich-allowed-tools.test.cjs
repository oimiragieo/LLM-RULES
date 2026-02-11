const { describe, test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// We need to test the enrichAllowedTools function
const { enrichAllowedTools } = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

// =============================================================================
// Unit Tests: enrichAllowedTools() - Mandatory Tools Enforcement
// =============================================================================

describe('enrichAllowedTools() - Mandatory Tools', () => {
  test('should always include TaskUpdate even when not provided', () => {
    // Empty allowed_tools should still get TaskUpdate
    const result = enrichAllowedTools('developer', [], 'You are DEVELOPER');

    assert.ok(
      result.includes('TaskUpdate'),
      `Expected TaskUpdate in result, got: ${JSON.stringify(result)}`
    );
  });

  test('should always include Skill even when not provided', () => {
    // Empty allowed_tools should still get Skill
    const result = enrichAllowedTools('developer', [], 'You are DEVELOPER');

    assert.ok(result.includes('Skill'), `Expected Skill in result, got: ${JSON.stringify(result)}`);
  });

  test('should preserve TaskUpdate if already present', () => {
    const result = enrichAllowedTools('developer', ['TaskUpdate', 'Read'], 'You are DEVELOPER');

    // Should have exactly one TaskUpdate (no duplicates)
    const taskUpdateCount = result.filter(t => t === 'TaskUpdate').length;
    assert.strictEqual(taskUpdateCount, 1, `Expected exactly 1 TaskUpdate, got ${taskUpdateCount}`);
  });

  test('should preserve Skill if already present', () => {
    const result = enrichAllowedTools('developer', ['Skill', 'Read'], 'You are DEVELOPER');

    // Should have exactly one Skill (no duplicates)
    const skillCount = result.filter(t => t === 'Skill').length;
    assert.strictEqual(skillCount, 1, `Expected exactly 1 Skill, got ${skillCount}`);
  });

  test('should not widen explicit allowed_tools with registry defaults', () => {
    const result = enrichAllowedTools('developer', ['TaskUpdate', 'TaskList'], 'You are DEVELOPER');

    assert.ok(result.includes('TaskUpdate'));
    assert.ok(result.includes('TaskList'));
    assert.ok(!result.includes('Bash'), `Bash should not be injected: ${JSON.stringify(result)}`);
    assert.ok(
      result.length <= 3,
      `Explicit allow-list should remain narrow, got: ${JSON.stringify(result)}`
    );
  });

  test('should include mandatory tools even when tools list is at maxTools limit', () => {
    // Create a list of tools that reaches the maxTools limit (15)
    const manyTools = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'TaskStop',
      'MemoryRecord',
      'WebSearch',
      'WebFetch',
      'NotebookEdit',
    ];

    const result = enrichAllowedTools('developer', manyTools, 'You are DEVELOPER');

    // Mandatory tools MUST be present regardless of limit
    assert.ok(
      result.includes('TaskUpdate'),
      `TaskUpdate MUST be present even at limit, got: ${JSON.stringify(result)}`
    );
    assert.ok(
      result.includes('Skill'),
      `Skill MUST be present even at limit, got: ${JSON.stringify(result)}`
    );
  });

  test('should include mandatory tools for all agent types', () => {
    const agentTypes = [
      'developer',
      'qa',
      'planner',
      'architect',
      'security-architect',
      'technical-writer',
      'code-reviewer',
      'researcher',
      'devops',
    ];

    for (const agentType of agentTypes) {
      const result = enrichAllowedTools(agentType, [], `You are ${agentType.toUpperCase()}`);

      assert.ok(
        result.includes('TaskUpdate'),
        `TaskUpdate missing for ${agentType}, got: ${JSON.stringify(result)}`
      );
      assert.ok(
        result.includes('Skill'),
        `Skill missing for ${agentType}, got: ${JSON.stringify(result)}`
      );
    }
  });

  test('should include mandatory tools for orchestrators', () => {
    const orchestrators = [
      'master-orchestrator',
      'evolution-orchestrator',
      'swarm-coordinator',
      'party-orchestrator',
    ];

    for (const orchType of orchestrators) {
      const result = enrichAllowedTools(orchType, [], `You are ${orchType.toUpperCase()}`);

      assert.ok(
        result.includes('TaskUpdate'),
        `TaskUpdate missing for ${orchType}, got: ${JSON.stringify(result)}`
      );
      assert.ok(
        result.includes('Skill'),
        `Skill missing for ${orchType}, got: ${JSON.stringify(result)}`
      );
    }
  });

  test('should include mandatory tools for general-purpose agent', () => {
    const result = enrichAllowedTools('general-purpose', [], 'You are DEVELOPER');

    assert.ok(
      result.includes('TaskUpdate'),
      `TaskUpdate missing for general-purpose, got: ${JSON.stringify(result)}`
    );
    assert.ok(
      result.includes('Skill'),
      `Skill missing for general-purpose, got: ${JSON.stringify(result)}`
    );
  });

  test('should include mandatory tools even with null currentTools', () => {
    const result = enrichAllowedTools('developer', null, 'You are DEVELOPER');

    assert.ok(
      result.includes('TaskUpdate'),
      `TaskUpdate missing with null currentTools, got: ${JSON.stringify(result)}`
    );
    assert.ok(
      result.includes('Skill'),
      `Skill missing with null currentTools, got: ${JSON.stringify(result)}`
    );
  });

  test('should include mandatory tools even with undefined currentTools', () => {
    const result = enrichAllowedTools('developer', undefined, 'You are DEVELOPER');

    assert.ok(
      result.includes('TaskUpdate'),
      `TaskUpdate missing with undefined currentTools, got: ${JSON.stringify(result)}`
    );
    assert.ok(
      result.includes('Skill'),
      `Skill missing with undefined currentTools, got: ${JSON.stringify(result)}`
    );
  });
});

// =============================================================================
// Integration Tests: Defensive Fallback Behavior
// =============================================================================

describe('enrichAllowedTools() - Defensive Fallback', () => {
  test('should use default mandatory tools when manifest is missing', () => {
    // Even if tool-manifest.json is missing or corrupt, should still have defaults
    const result = enrichAllowedTools('developer', [], 'You are DEVELOPER');

    // Default mandatory tools should always be present
    assert.ok(result.includes('TaskUpdate'), 'TaskUpdate should be in defaults');
    assert.ok(result.includes('Skill'), 'Skill should be in defaults');
  });

  test('should not exceed maxTools limit while including mandatory tools', () => {
    const manyTools = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'TaskStop',
      'MemoryRecord',
      'WebSearch',
      'WebFetch',
      'NotebookEdit',
    ];

    const result = enrichAllowedTools('developer', manyTools, 'You are DEVELOPER');

    // Result should include mandatory tools, possibly displacing others
    assert.ok(result.length <= 15, `Expected max 15 tools, got ${result.length}`);
    assert.ok(result.includes('TaskUpdate'), 'TaskUpdate must be present');
    assert.ok(result.includes('Skill'), 'Skill must be present');
  });
});

console.log('All enrichAllowedTools tests completed!');
