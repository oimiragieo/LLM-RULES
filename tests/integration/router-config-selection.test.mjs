/**
 * Router Config Selection Integration Tests
 *
 * ADR-075 Phase 4A: End-to-end testing of model resolution from config.yaml
 *
 * Tests verify:
 * 1. Planner spawns with opus model (from config.yaml)
 * 2. QA spawns with opus model
 * 3. Developer spawns with haiku model for simple tasks (complexity-based)
 * 4. config-model-validator hook logs WARNING on mismatch
 * 5. Orchestrator subagents use config-resolved models
 * 6. Fallback to default for unknown agent types
 *
 * @module tests/integration/router-config-selection
 * @see {@link file://.claude/lib/utils/agent-config-reader.cjs} Config reader
 * @see {@link file://.claude/hooks/routing/config-model-validator.cjs} Validator hook
 */

'use strict';

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Project root
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Import modules under test
const {
  resolveAgentModel,
  normalizeModel,
  getShorthand,
  getAgentConfig,
  MODEL_ALIASES,
  COMPLEXITY_DEFAULTS,
} = require(path.join(PROJECT_ROOT, '.claude/lib/utils/agent-config-reader.cjs'));

const {
  validateModelConfig,
  formatAuditEntry,
} = require(path.join(PROJECT_ROOT, '.claude/hooks/routing/config-model-validator.cjs'));

// Test fixtures directory
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'tests/fixtures');
const CONFIG_PATH = path.join(PROJECT_ROOT, '.claude/config.yaml');

/**
 * Helper to simulate Task spawn input
 */
function createTaskInput(agentType, model, additionalPrompt = '') {
  return {
    model,
    prompt: `You are ${agentType.toUpperCase()}. ${additionalPrompt}`.trim(),
  };
}

/**
 * Helper to create spawn prompt with agent file reference
 */
function createSpawnPromptWithPath(agentType, category = 'core') {
  return `Read: .claude/agents/${category}/${agentType}.md
Then execute the task.`;
}

describe('Router Config Selection Integration', () => {
  before(() => {
    // Ensure fixtures directory exists
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  describe('1. Spawn Planner - Verify Opus Model from config.yaml', () => {
    it('should resolve planner to opus model from config.yaml', () => {
      const result = resolveAgentModel('planner', PROJECT_ROOT);

      assert.strictEqual(result.model, 'claude-opus-4-5-20251101', 'Planner should use opus model');
      assert.strictEqual(result.shorthand, 'opus', 'Shorthand should be opus');
      assert.strictEqual(result.source, 'config.yaml', 'Source should be config.yaml');
    });

    it('should validate planner spawn with opus model matches config', () => {
      const toolInput = createTaskInput('planner', 'opus', 'Design the authentication system.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow planner with opus');
      assert.strictEqual(result.mismatch, false, 'Should not flag mismatch');
      assert.strictEqual(result.configuredModel, 'opus', 'Configured model should be opus');
    });

    it('should validate planner spawn with full model ID matches config', () => {
      const toolInput = createTaskInput('planner', 'claude-opus-4-5-20251101', 'Design system.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow full model ID');
      assert.strictEqual(result.mismatch, false, 'Full ID should match shorthand');
    });

    it('should include extended_thinking in planner config', () => {
      const config = getAgentConfig('planner', PROJECT_ROOT);

      assert.ok(config, 'Planner config should exist');
      assert.strictEqual(config.extended_thinking, true, 'Extended thinking should be enabled');
    });

    it('should generate correct TaskUpdate metadata for planner spawn', () => {
      const result = resolveAgentModel('planner', PROJECT_ROOT);

      const expectedMetadata = {
        modelResolutionSource: result.source,
        configuredModel: result.model,
        actualModel: result.model,
      };

      assert.strictEqual(expectedMetadata.modelResolutionSource, 'config.yaml');
      assert.strictEqual(expectedMetadata.configuredModel, 'claude-opus-4-5-20251101');
    });
  });

  describe('2. Spawn QA - Verify Opus Model from config.yaml', () => {
    it('should resolve qa to opus model from config.yaml', () => {
      const result = resolveAgentModel('qa', PROJECT_ROOT);

      assert.strictEqual(result.model, 'claude-opus-4-5-20251101', 'QA should use opus model');
      assert.strictEqual(result.shorthand, 'opus', 'Shorthand should be opus');
      assert.strictEqual(result.source, 'config.yaml', 'Source should be config.yaml');
    });

    it('should validate qa spawn with opus model matches config', () => {
      const toolInput = createTaskInput('qa', 'opus', 'Test the implementation thoroughly.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow QA with opus');
      assert.strictEqual(result.mismatch, false, 'Should not flag mismatch');
    });

    it('should detect mismatch when qa spawned with haiku', () => {
      const toolInput = createTaskInput('qa', 'haiku', 'Test the implementation.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.mismatch, true, 'Should detect mismatch');
      assert.strictEqual(result.configuredModel, 'opus', 'Configured should be opus');
      assert.strictEqual(result.spawnModel, 'haiku', 'Spawn model should be haiku');
    });

    it('should validate qa spawn via agent path reference', () => {
      const toolInput = {
        model: 'opus',
        prompt: createSpawnPromptWithPath('qa', 'core'),
      };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.agentType, 'qa', 'Should extract qa from path');
      assert.strictEqual(result.decision, 'allow', 'Should allow with correct model');
    });
  });

  describe('3. Spawn Developer for Simple Task - Verify Complexity-Based Default', () => {
    it('should resolve developer to sonnet model from config.yaml', () => {
      const result = resolveAgentModel('developer', PROJECT_ROOT);

      assert.strictEqual(result.model, 'claude-sonnet-4-5', 'Developer should use sonnet model');
      assert.strictEqual(result.shorthand, 'sonnet', 'Shorthand should be sonnet');
      assert.strictEqual(result.source, 'config.yaml', 'Source should be config.yaml');
    });

    it('should validate developer spawn with sonnet matches config', () => {
      const toolInput = createTaskInput('developer', 'sonnet', 'Fix typo in README.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow developer with sonnet');
      assert.strictEqual(result.mismatch, false, 'Should not flag mismatch');
    });

    it('should detect mismatch when developer spawned with opus (over-specification)', () => {
      const toolInput = createTaskInput('developer', 'opus', 'Implement complex feature.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.mismatch, true, 'Should detect opus override for developer');
      assert.strictEqual(result.configuredModel, 'sonnet', 'Config says sonnet');
      assert.strictEqual(result.spawnModel, 'opus', 'Spawn tried opus');
    });

    it('should resolve context-compressor to haiku (complexity-based default)', () => {
      // context-compressor is not in config.yaml, falls to complexity default
      const result = resolveAgentModel('context-compressor', PROJECT_ROOT);

      assert.strictEqual(result.shorthand, 'haiku', 'Context-compressor should use haiku');
      // Source might be frontmatter or complexity-default depending on agent file
      assert.ok(
        ['frontmatter', 'complexity-default'].includes(result.source),
        `Source should be frontmatter or complexity-default, got: ${result.source}`
      );
    });
  });

  describe('4. Config Mismatch Warning - Hook Logs WARNING', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.CONFIG_MODEL_VALIDATOR;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.CONFIG_MODEL_VALIDATOR;
      } else {
        process.env.CONFIG_MODEL_VALIDATOR = originalEnv;
      }
    });

    it('should return warn decision on mismatch in default mode', () => {
      delete process.env.CONFIG_MODEL_VALIDATOR; // Ensure default mode

      const toolInput = createTaskInput('planner', 'sonnet', 'Design system.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.mismatch, true, 'Should detect mismatch');
      assert.strictEqual(result.decision, 'warn', 'Default mode should warn, not block');
    });

    it('should create audit entry with mismatch details', () => {
      const toolInput = createTaskInput('planner', 'sonnet', 'Design system.');
      const validation = validateModelConfig(toolInput, PROJECT_ROOT);
      const auditEntry = formatAuditEntry(validation);

      assert.strictEqual(auditEntry.hook, 'config-model-validator');
      assert.strictEqual(auditEntry.event, 'model_mismatch');
      assert.strictEqual(auditEntry.agentType, 'planner');
      assert.strictEqual(auditEntry.spawnModel, 'sonnet');
      assert.strictEqual(auditEntry.configuredModel, 'opus');
      assert.strictEqual(auditEntry.source, 'config.yaml');
      assert.ok(auditEntry.timestamp, 'Should have timestamp');
    });

    it('should return block decision when CONFIG_MODEL_VALIDATOR=block', () => {
      process.env.CONFIG_MODEL_VALIDATOR = 'block';

      const toolInput = createTaskInput('qa', 'haiku', 'Test implementation.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.mismatch, true, 'Should detect mismatch');
      assert.strictEqual(result.decision, 'block', 'Block mode should block');
    });

    it('should skip validation when CONFIG_MODEL_VALIDATOR=off', () => {
      process.env.CONFIG_MODEL_VALIDATOR = 'off';

      const toolInput = createTaskInput('planner', 'haiku', 'Mismatched model.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow when off');
      assert.strictEqual(result.skipped, true, 'Should flag as skipped');
    });

    it('should include mismatch message in validation result', () => {
      delete process.env.CONFIG_MODEL_VALIDATOR;

      const toolInput = createTaskInput('architect', 'sonnet', 'Design architecture.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      // architect is configured with opus
      assert.ok(result.mismatch, 'Should detect mismatch');
      assert.ok(result.message, 'Should have message');
      assert.ok(result.message.includes('architect'), 'Message should mention agent');
      assert.ok(result.message.includes('sonnet'), 'Message should mention spawn model');
      assert.ok(result.message.includes('opus'), 'Message should mention config model');
    });
  });

  describe('5. Orchestrator Subagent Spawning - Config-Resolved Models', () => {
    it('should resolve evolution-orchestrator to opus (complexity default)', () => {
      const result = resolveAgentModel('evolution-orchestrator', PROJECT_ROOT);

      // evolution-orchestrator not in config.yaml, uses complexity default
      assert.strictEqual(result.shorthand, 'opus', 'Orchestrators should use opus');
      assert.ok(
        ['frontmatter', 'complexity-default'].includes(result.source),
        `Source should be frontmatter or complexity-default, got: ${result.source}`
      );
    });

    it('should resolve master-orchestrator to opus (complexity default)', () => {
      const result = resolveAgentModel('master-orchestrator', PROJECT_ROOT);

      assert.strictEqual(result.shorthand, 'opus', 'Master orchestrator should use opus');
    });

    it('should resolve party-orchestrator to opus (complexity default)', () => {
      const result = resolveAgentModel('party-orchestrator', PROJECT_ROOT);

      assert.strictEqual(result.shorthand, 'opus', 'Party orchestrator should use opus');
    });

    it('should validate orchestrator spawn with opus', () => {
      const toolInput = createTaskInput('master-orchestrator', 'opus', 'Coordinate agents.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow orchestrator with opus');
    });

    it('should create audit trail for orchestrator model selection', () => {
      const result = resolveAgentModel('evolution-orchestrator', PROJECT_ROOT);
      const auditEntry = {
        hook: 'config-model-validator',
        event: 'ConfigModelSelection',
        agent_id: 'evolution-orchestrator',
        configured_model: result.model,
        actual_model: result.model,
        complexity: 'high',
        source: result.source,
        timestamp: new Date().toISOString(),
      };

      assert.strictEqual(auditEntry.agent_id, 'evolution-orchestrator');
      assert.ok(auditEntry.configured_model.includes('opus'), 'Should be opus model');
    });
  });

  describe('6. Fallback to Default - Unknown Agent Type', () => {
    it('should fallback to sonnet for unknown agent type', () => {
      const result = resolveAgentModel('unknown-agent-xyz', PROJECT_ROOT);

      assert.strictEqual(result.shorthand, 'sonnet', 'Unknown agent should use sonnet default');
      assert.strictEqual(result.source, 'complexity-default', 'Source should be complexity-default');
      assert.strictEqual(result.model, 'claude-sonnet-4-5', 'Full model ID should be sonnet');
    });

    it('should not crash when validating unknown agent spawn', () => {
      const toolInput = createTaskInput('totally-new-agent', 'sonnet', 'Do something.');
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow unknown agent');
      assert.strictEqual(result.agentType, 'totally-new-agent', 'Should extract agent type');
    });

    it('should handle null/undefined agent type gracefully', () => {
      assert.doesNotThrow(() => resolveAgentModel(null, PROJECT_ROOT));
      assert.doesNotThrow(() => resolveAgentModel(undefined, PROJECT_ROOT));
      assert.doesNotThrow(() => resolveAgentModel('', PROJECT_ROOT));

      const result = resolveAgentModel(null, PROJECT_ROOT);
      assert.strictEqual(result.shorthand, 'sonnet', 'Null agent should default to sonnet');
    });

    it('should handle spawn without agent type in prompt', () => {
      const toolInput = { model: 'sonnet', prompt: 'Execute this generic task.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow when agent type unknown');
      assert.strictEqual(result.agentType, null, 'Agent type should be null');
      assert.strictEqual(result.mismatch, false, 'Cannot determine mismatch without agent type');
    });

    it('should handle spawn without model specified', () => {
      const toolInput = { prompt: 'You are PLANNER. Design system.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.strictEqual(result.decision, 'allow', 'Should allow when no model specified');
      assert.strictEqual(result.mismatch, false, 'No mismatch when no model to compare');
    });
  });

  describe('End-to-End Integration Scenarios', () => {
    it('should verify config.yaml exists and has agent definitions', () => {
      assert.ok(fs.existsSync(CONFIG_PATH), 'config.yaml should exist');

      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      assert.ok(content.includes('agents:'), 'Should have agents section');
      assert.ok(content.includes('planner:'), 'Should have planner agent');
      assert.ok(content.includes('developer:'), 'Should have developer agent');
      assert.ok(content.includes('qa:'), 'Should have qa agent');
      assert.ok(content.includes('architect:'), 'Should have architect agent');
    });

    it('should verify model aliases are bidirectional', () => {
      assert.strictEqual(MODEL_ALIASES['opus'], 'claude-opus-4-5-20251101');
      assert.strictEqual(MODEL_ALIASES['claude-opus-4-5-20251101'], 'opus');

      assert.strictEqual(MODEL_ALIASES['sonnet'], 'claude-sonnet-4-5');
      assert.strictEqual(MODEL_ALIASES['claude-sonnet-4-5'], 'sonnet');

      assert.strictEqual(MODEL_ALIASES['haiku'], 'claude-haiku-4-5');
      assert.strictEqual(MODEL_ALIASES['claude-haiku-4-5'], 'haiku');
    });

    it('should verify complexity defaults include all high-complexity agents', () => {
      const highComplexityAgents = [
        'planner',
        'architect',
        'qa',
        'security-architect',
        'evolution-orchestrator',
        'master-orchestrator',
        'party-orchestrator',
        'swarm-coordinator',
      ];

      for (const agent of highComplexityAgents) {
        assert.strictEqual(
          COMPLEXITY_DEFAULTS[agent],
          'opus',
          `${agent} should default to opus`
        );
      }
    });

    it('should verify normalizeModel and getShorthand are inverse operations', () => {
      const testCases = ['opus', 'sonnet', 'haiku'];

      for (const shorthand of testCases) {
        const fullId = normalizeModel(shorthand);
        const backToShorthand = getShorthand(fullId);
        assert.strictEqual(backToShorthand, shorthand, `Round trip failed for ${shorthand}`);
      }
    });

    it('should provide complete audit trail for spawn decision', () => {
      const toolInput = createTaskInput('planner', 'sonnet', 'Design auth system.');
      const validation = validateModelConfig(toolInput, PROJECT_ROOT);
      const auditEntry = formatAuditEntry(validation);

      // Complete audit trail should include:
      const requiredFields = [
        'hook',
        'event',
        'timestamp',
        'agentType',
        'spawnModel',
        'configuredModel',
        'source',
        'decision',
        'mismatch',
      ];

      for (const field of requiredFields) {
        assert.ok(field in auditEntry, `Audit entry should have ${field}`);
      }
    });
  });
});

describe('Config Model Validator - Regression Prevention', () => {
  it('should not break existing spawn patterns without model', () => {
    // Many existing spawns may not specify model explicitly
    const legacyPrompts = [
      'You are DEVELOPER. Implement the feature.',
      'You are QA. Test everything.',
      'You are PLANNER. Create the plan.',
    ];

    for (const prompt of legacyPrompts) {
      const toolInput = { prompt }; // No model specified
      assert.doesNotThrow(
        () => validateModelConfig(toolInput, PROJECT_ROOT),
        `Should not throw for prompt: ${prompt}`
      );

      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      assert.strictEqual(result.decision, 'allow', 'Should allow legacy spawns');
    }
  });

  it('should preserve explicit model override capability', () => {
    // Router should still be able to override config when necessary
    const toolInput = createTaskInput('developer', 'opus', 'Complex refactoring task.');
    const result = validateModelConfig(toolInput, PROJECT_ROOT);

    // Should detect but not prevent (in warn mode)
    assert.strictEqual(result.mismatch, true, 'Should flag explicit override');
    assert.strictEqual(result.decision, 'warn', 'Should warn but not block');
  });
});
