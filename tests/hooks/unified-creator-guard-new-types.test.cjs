/**
 * Tests for unified-creator-guard.cjs - New Artifact Types (rules, commands, tools)
 * Step 3: Extend unified-creator-guard for Rules, Commands, and Tools
 *
 * These tests verify that rules, commands, and tools are covered by the
 * creator guard (initially in warn mode, not block).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  findRequiredCreator,
  CREATOR_CONFIGS,
} = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

describe('unified-creator-guard - New Artifact Types (rules, commands, tools)', () => {
  describe('Step 3: Rules protection', () => {
    it('should identify rule files as requiring rule-creator', () => {
      const result = findRequiredCreator('.claude/rules/testing.md');

      assert.ok(result, 'Rule files should require a creator');
      assert.strictEqual(result.creator, 'rule-creator', 'Should require rule-creator');
      assert.strictEqual(result.artifactType, 'rule', 'Should be rule type');
    });

    it('should work with different rule names', () => {
      const result = findRequiredCreator('.claude/rules/security.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'rule-creator');
    });

    it('should work with absolute paths', () => {
      const path = require('path');
      const { PROJECT_ROOT } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');
      const absolutePath = path.join(PROJECT_ROOT, '.claude/rules/new-rule.md');

      const result = findRequiredCreator(absolutePath);

      assert.ok(result);
      assert.strictEqual(result.creator, 'rule-creator');
    });

    it('should work with Windows-style paths', () => {
      const result = findRequiredCreator('.claude\\rules\\git-workflow.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'rule-creator');
    });
  });

  describe('Step 3: Commands protection', () => {
    it('should identify command files as requiring command-creator', () => {
      const result = findRequiredCreator('.claude/commands/tdd.md');

      assert.ok(result, 'Command files should require a creator');
      assert.strictEqual(result.creator, 'command-creator', 'Should require command-creator');
      assert.strictEqual(result.artifactType, 'command', 'Should be command type');
    });

    it('should work with different command names', () => {
      const result = findRequiredCreator('.claude/commands/debugging.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'command-creator');
    });

    it('should work with absolute paths', () => {
      const path = require('path');
      const { PROJECT_ROOT } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');
      const absolutePath = path.join(PROJECT_ROOT, '.claude/commands/new-cmd.md');

      const result = findRequiredCreator(absolutePath);

      assert.ok(result);
      assert.strictEqual(result.creator, 'command-creator');
    });

    it('should work with Windows-style paths', () => {
      const result = findRequiredCreator('.claude\\commands\\security-review.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'command-creator');
    });
  });

  describe('Step 3: Tools protection', () => {
    it('should identify tool CJS files as requiring tool-creator', () => {
      const result = findRequiredCreator('.claude/tools/cli/validator.cjs');

      assert.ok(result, 'Tool files should require a creator');
      assert.strictEqual(result.creator, 'tool-creator', 'Should require tool-creator');
      assert.strictEqual(result.artifactType, 'tool', 'Should be tool type');
    });

    it('should identify tool MJS files as requiring tool-creator', () => {
      const result = findRequiredCreator('.claude/tools/analysis/analyzer.mjs');

      assert.ok(result, 'MJS tool files should require a creator');
      assert.strictEqual(result.creator, 'tool-creator');
    });

    it('should work with deeply nested tool paths', () => {
      const result = findRequiredCreator('.claude/tools/cli/sub/deep/utility.cjs');

      assert.ok(result);
      assert.strictEqual(result.creator, 'tool-creator');
    });

    it('should EXCLUDE _archive directories', () => {
      const result = findRequiredCreator('.claude/tools/cli/_archive/old-tool.cjs');

      assert.strictEqual(result, null, 'Archived tools should not be protected');
    });

    it('should EXCLUDE test files', () => {
      const result = findRequiredCreator('.claude/tools/cli/validator.test.cjs');

      assert.strictEqual(result, null, 'Test files should not be protected');
    });

    it('should work with absolute paths', () => {
      const path = require('path');
      const { PROJECT_ROOT } = require('../../.claude/hooks/routing/unified-creator-guard.cjs');
      const absolutePath = path.join(PROJECT_ROOT, '.claude/tools/cli/new-tool.cjs');

      const result = findRequiredCreator(absolutePath);

      assert.ok(result);
      assert.strictEqual(result.creator, 'tool-creator');
    });

    it('should work with Windows-style paths', () => {
      const result = findRequiredCreator('.claude\\tools\\cli\\security-lint.cjs');

      assert.ok(result);
      assert.strictEqual(result.creator, 'tool-creator');
    });
  });

  describe('Regression: Existing 6 artifact types still blocked', () => {
    it('should still block SKILL.md files', () => {
      const result = findRequiredCreator('.claude/skills/tdd/SKILL.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'skill-creator');
    });

    it('should still block agent files', () => {
      const result = findRequiredCreator('.claude/agents/core/developer.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'agent-creator');
    });

    it('should still block hook files', () => {
      const result = findRequiredCreator('.claude/hooks/routing/routing-guard.cjs');

      assert.ok(result);
      assert.strictEqual(result.creator, 'hook-creator');
    });

    it('should still block workflow files', () => {
      const result = findRequiredCreator('.claude/workflows/core/router-decision.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'workflow-creator');
    });

    it('should still block schema files', () => {
      const result = findRequiredCreator('.claude/schemas/skill-definition.schema.json');

      assert.ok(result);
      assert.strictEqual(result.creator, 'schema-creator');
    });

    it('should still block template files', () => {
      const result = findRequiredCreator('.claude/templates/spawn/universal-agent-spawn.md');

      assert.ok(result);
      assert.strictEqual(result.creator, 'template-creator');
    });
  });

  describe('CREATOR_CONFIGS structure verification', () => {
    it('should have at least 9 creator configurations (6 original + 3 new)', () => {
      assert.ok(CREATOR_CONFIGS.length >= 9, `Should have at least 9 configs, got ${CREATOR_CONFIGS.length}`);
    });

    it('should include rule-creator configuration', () => {
      const ruleConfig = CREATOR_CONFIGS.find(c => c.creator === 'rule-creator');
      assert.ok(ruleConfig, 'Should have rule-creator config');
      assert.strictEqual(ruleConfig.artifactType, 'rule');
    });

    it('should include command-creator configuration', () => {
      const cmdConfig = CREATOR_CONFIGS.find(c => c.creator === 'command-creator');
      assert.ok(cmdConfig, 'Should have command-creator config');
      assert.strictEqual(cmdConfig.artifactType, 'command');
    });

    it('should include tool-creator configuration', () => {
      const toolConfig = CREATOR_CONFIGS.find(c => c.creator === 'tool-creator');
      assert.ok(toolConfig, 'Should have tool-creator config');
      assert.strictEqual(toolConfig.artifactType, 'tool');
    });
  });
});
