/**
 * Tests for unified-creator-guard.cjs - Protected Paths (settings.json, agent-registry.json)
 * Step 1: Protect settings.json and agent-registry.json
 *
 * These tests verify that writes to critical infrastructure files
 * (settings.json and agent-registry.json) are blocked unless the
 * appropriate creator is active.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  findRequiredCreator,
  markCreatorActive,
  validateCreatorWorkflow,
  PROJECT_ROOT,
} = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

const STATE_FILE_PATH = path.join(PROJECT_ROOT, '.claude/context/runtime/active-creators.json');

describe('unified-creator-guard - Protected Infrastructure Files', () => {
  beforeEach(() => {
    // Clean state before each test
    if (fs.existsSync(STATE_FILE_PATH)) {
      fs.unlinkSync(STATE_FILE_PATH);
    }
  });

  afterEach(() => {
    // Clean state after each test
    if (fs.existsSync(STATE_FILE_PATH)) {
      fs.unlinkSync(STATE_FILE_PATH);
    }
  });

  describe('Step 1: settings.json protection', () => {
    it('should identify settings.json as requiring hook-creator', () => {
      const result = findRequiredCreator('.claude/settings.json');

      assert.ok(result, 'settings.json should require a creator');
      assert.strictEqual(result.creator, 'hook-creator', 'Should require hook-creator');
      assert.strictEqual(result.artifactType, 'config:settings', 'Should be config:settings type');
    });

    it('should block writes to settings.json when hook-creator is not active', () => {
      const toolInput = {
        file_path: '.claude/settings.json',
        content: '{ "hooks": [] }',
      };

      const result = validateCreatorWorkflow('Write', toolInput);

      assert.strictEqual(result.pass, false, 'Should block write when creator not active');
      assert.strictEqual(result.result, 'block', 'Should return block result');
      assert.ok(result.message.includes('hook-creator'), 'Message should mention hook-creator');
    });

    it('should allow writes to settings.json when hook-creator is active', () => {
      // Mark hook-creator as active
      markCreatorActive('hook-creator', 'settings.json');

      const toolInput = {
        file_path: '.claude/settings.json',
        content: '{ "hooks": [] }',
      };

      const result = validateCreatorWorkflow('Write', toolInput);

      assert.strictEqual(result.pass, true, 'Should allow write when creator is active');
    });

    it('should work with absolute paths to settings.json', () => {
      const absolutePath = path.join(PROJECT_ROOT, '.claude/settings.json');
      const result = findRequiredCreator(absolutePath);

      assert.ok(result, 'Should match absolute path');
      assert.strictEqual(result.creator, 'hook-creator');
    });

    it('should work with Windows-style backslash paths', () => {
      const windowsPath = '.claude\\settings.json';
      const result = findRequiredCreator(windowsPath);

      assert.ok(result, 'Should match Windows path');
      assert.strictEqual(result.creator, 'hook-creator');
    });
  });

  describe('Step 1: agent-registry.json protection', () => {
    it('should identify agent-registry.json as requiring agent-creator', () => {
      const result = findRequiredCreator('.claude/context/agent-registry.json');

      assert.ok(result, 'agent-registry.json should require a creator');
      assert.strictEqual(result.creator, 'agent-creator', 'Should require agent-creator');
      assert.strictEqual(result.artifactType, 'config:agent-registry', 'Should be config:agent-registry type');
    });

    it('should block writes to agent-registry.json when agent-creator is not active', () => {
      const toolInput = {
        file_path: '.claude/context/agent-registry.json',
        content: '{ "agents": [] }',
      };

      const result = validateCreatorWorkflow('Write', toolInput);

      assert.strictEqual(result.pass, false, 'Should block write when creator not active');
      assert.strictEqual(result.result, 'block', 'Should return block result');
      assert.ok(result.message.includes('agent-creator'), 'Message should mention agent-creator');
    });

    it('should allow writes to agent-registry.json when agent-creator is active', () => {
      // Mark agent-creator as active
      markCreatorActive('agent-creator', 'agent-registry.json');

      const toolInput = {
        file_path: '.claude/context/agent-registry.json',
        content: '{ "agents": [] }',
      };

      const result = validateCreatorWorkflow('Write', toolInput);

      assert.strictEqual(result.pass, true, 'Should allow write when creator is active');
    });

    it('should work with absolute paths to agent-registry.json', () => {
      const absolutePath = path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');
      const result = findRequiredCreator(absolutePath);

      assert.ok(result, 'Should match absolute path');
      assert.strictEqual(result.creator, 'agent-creator');
    });

    it('should work with Windows-style backslash paths', () => {
      const windowsPath = '.claude\\context\\agent-registry.json';
      const result = findRequiredCreator(windowsPath);

      assert.ok(result, 'Should match Windows path');
      assert.strictEqual(result.creator, 'agent-creator');
    });
  });

  describe('Regression: existing creator paths still work', () => {
    it('should still protect SKILL.md files', () => {
      const result = findRequiredCreator('.claude/skills/tdd/SKILL.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'skill-creator');
      assert.strictEqual(result.artifactType, 'skill');
    });

    it('should still protect agent files', () => {
      const result = findRequiredCreator('.claude/agents/core/developer.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'agent-creator');
      assert.strictEqual(result.artifactType, 'agent');
    });

    it('should still protect hook files', () => {
      const result = findRequiredCreator('.claude/hooks/routing/routing-guard.cjs');

      assert.ok(result);
      assert.strictEqual(result.creator, 'hook-creator');
      assert.strictEqual(result.artifactType, 'hook');
    });

    it('should still protect workflow files', () => {
      const result = findRequiredCreator('.claude/workflows/core/router-decision.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'workflow-creator');
      assert.strictEqual(result.artifactType, 'workflow');
    });

    it('should still protect schema files', () => {
      const result = findRequiredCreator('.claude/schemas/skill-definition.schema.json');

      assert.ok(result);
      assert.strictEqual(result.creator, 'schema-creator');
      assert.strictEqual(result.artifactType, 'schema');
    });

    it('should still protect template files', () => {
      const result = findRequiredCreator('.claude/templates/spawn/universal-agent-spawn.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'template-creator');
      assert.strictEqual(result.artifactType, 'template');
    });
  });
});
