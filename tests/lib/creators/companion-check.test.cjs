'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadCompanionMatrix,
  checkCompanions,
  formatCompanionChecklist,
  getAutoSpawnSuggestions,
} = require('../../../.claude/lib/creators/companion-check.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

describe('companion-check', () => {
  describe('loadCompanionMatrix', () => {
    it('should load companion matrix from default path', () => {
      const matrix = loadCompanionMatrix();

      assert.ok(matrix, 'Matrix should be loaded');
      assert.ok(matrix.agent, 'Matrix should have agent type');
      assert.ok(matrix.skill, 'Matrix should have skill type');
      assert.ok(matrix.hook, 'Matrix should have hook type');
      assert.ok(matrix.workflow, 'Matrix should have workflow type');
      assert.ok(matrix.command, 'Matrix should have command type');
      assert.ok(matrix.rule, 'Matrix should have rule type');
      assert.ok(matrix.tool, 'Matrix should have tool type');
      assert.ok(matrix.template, 'Matrix should have template type');
      assert.ok(matrix.schema, 'Matrix should have schema type');
    });

    it('should throw error if graph file not found', () => {
      assert.throws(() => loadCompanionMatrix('/nonexistent/path.json'), /not found/);
    });

    it('should throw error if companionMatrix key missing', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-test-'));
      const tempFile = path.join(tempDir, 'graph.json');

      try {
        fs.writeFileSync(tempFile, JSON.stringify({ version: '1.0.0' }));

        assert.throws(() => loadCompanionMatrix(tempFile), /companionMatrix key not found/);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('checkCompanions - artifact name validation', () => {
    it('should accept valid artifact names', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });
      assert.strictEqual(result.artifactName, 'tdd');
    });

    it('should accept artifact names with hyphens', () => {
      const result = checkCompanions('skill', 'code-quality-expert', { projectRoot: PROJECT_ROOT });
      assert.strictEqual(result.artifactName, 'code-quality-expert');
    });

    it('should reject path traversal attempts', () => {
      assert.throws(() => checkCompanions('skill', '../../../etc/passwd'), /path traversal/);
    });

    it('should reject Windows reserved names', () => {
      assert.throws(() => checkCompanions('skill', 'nul'), /reserved name/);

      assert.throws(() => checkCompanions('skill', 'con'), /reserved name/);
    });

    it('should reject empty artifact names', () => {
      assert.throws(() => checkCompanions('skill', ''), /Invalid artifact name/);
    });
  });

  describe('checkCompanions - check strategies', () => {
    it('should check file-exists strategy', () => {
      const result = checkCompanions('rule', 'agents', { projectRoot: PROJECT_ROOT });

      // rule type has "rules-directory" required companion with file-exists check
      const rulesCheck = result.required.find(c => c.type === 'rules-directory');
      assert.ok(rulesCheck, 'Should have rules-directory check');
      assert.strictEqual(rulesCheck.check, 'file-exists');
      assert.strictEqual(rulesCheck.exists, true, 'agents.md should exist in .claude/rules/');
    });

    it('should check grep-in-file strategy', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });

      // skill type has "catalog-entry" required companion with grep-in-file check
      const catalogCheck = result.required.find(c => c.type === 'catalog-entry');
      assert.ok(catalogCheck, 'Should have catalog-entry check');
      assert.strictEqual(catalogCheck.check, 'grep-in-file');
      assert.strictEqual(catalogCheck.exists, true, 'tdd should be in skill-catalog.md');
    });

    it('should check json-key-exists strategy', () => {
      const result = checkCompanions('agent', 'developer', { projectRoot: PROJECT_ROOT });

      // agent type has "registry-entry" required companion with json-key-exists check
      const registryCheck = result.required.find(c => c.type === 'registry-entry');
      assert.ok(registryCheck, 'Should have registry-entry check');
      assert.strictEqual(registryCheck.check, 'json-key-exists');
      assert.strictEqual(registryCheck.exists, true, 'developer should be in agent-registry.json');
    });

    it('should check glob-match strategy', () => {
      const result = checkCompanions('agent', 'developer', { projectRoot: PROJECT_ROOT });

      // agent type has "skill-assignment" recommended companion with glob-match check
      const skillCheck = result.recommended.find(c => c.type === 'skill-assignment');
      assert.ok(skillCheck, 'Should have skill-assignment check');
      assert.strictEqual(skillCheck.check, 'glob-match');
      // developer agent should have assigned skills
      assert.strictEqual(skillCheck.exists, true, 'developer should have assigned skills');
    });

    it('should check settings-registered strategy', () => {
      const result = checkCompanions('hook', 'routing-guard', { projectRoot: PROJECT_ROOT });

      // hook type has "settings-registration" required companion with settings-registered check
      const settingsCheck = result.required.find(c => c.type === 'settings-registration');
      assert.ok(settingsCheck, 'Should have settings-registration check');
      assert.strictEqual(settingsCheck.check, 'settings-registered');
      assert.strictEqual(settingsCheck.exists, true, 'routing-guard should be in settings.json');
    });
  });

  describe('checkCompanions - result structure', () => {
    it('should return structured results', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });

      assert.strictEqual(result.artifactType, 'skill');
      assert.strictEqual(result.artifactName, 'tdd');
      assert.ok(Array.isArray(result.required));
      assert.ok(Array.isArray(result.recommended));
      assert.ok(Array.isArray(result.optional));
      assert.ok(result.summary);
      assert.ok(typeof result.summary.total === 'number');
      assert.ok(typeof result.summary.found === 'number');
      assert.ok(typeof result.summary.missing === 'number');
    });

    it('should count summary correctly', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });

      const totalChecks =
        result.required.length + result.recommended.length + result.optional.length;
      assert.strictEqual(result.summary.total, totalChecks);

      const foundCount = [...result.required, ...result.recommended, ...result.optional].filter(
        c => c.exists
      ).length;
      assert.strictEqual(result.summary.found, foundCount);

      assert.strictEqual(result.summary.found + result.summary.missing, result.summary.total);
    });

    it('should throw error for unknown artifact type', () => {
      assert.throws(() => checkCompanions('unknown-type', 'test'), /Unknown artifact type/);
    });
  });

  describe('formatCompanionChecklist', () => {
    it('should format results as markdown checklist', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });
      const markdown = formatCompanionChecklist(result);

      assert.ok(markdown.includes('## Companion Check: skill "tdd"'));
      assert.ok(markdown.includes('### Required'));
      assert.ok(markdown.includes('### Recommended'));
      assert.ok(markdown.includes('### Optional'));
      assert.ok(markdown.includes('### Summary'));
      assert.ok(markdown.includes('Total companions:'));
    });

    it('should use checkboxes for found/missing items', () => {
      const result = checkCompanions('skill', 'tdd', { projectRoot: PROJECT_ROOT });
      const markdown = formatCompanionChecklist(result);

      // Should have checked boxes for found items
      assert.ok(markdown.includes('- [x]'));

      // May have unchecked boxes for missing items
      // (not guaranteed as tdd might have all companions)
    });
  });

  describe('getAutoSpawnSuggestions - kill switch', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.AUTO_COMPANION_SPAWN;
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_COMPANION_SPAWN;
      } else {
        process.env.AUTO_COMPANION_SPAWN = originalEnv;
      }
    });

    it('should return empty array when kill switch is off', () => {
      process.env.AUTO_COMPANION_SPAWN = 'off';

      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });
      const suggestions = getAutoSpawnSuggestions(result);

      assert.deepStrictEqual(suggestions, []);
    });

    it('should return suggestions when kill switch is on', () => {
      process.env.AUTO_COMPANION_SPAWN = 'on';

      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });
      const suggestions = getAutoSpawnSuggestions(result);

      // nonexistent-skill will have missing required companions
      if (result.required.some(c => !c.exists)) {
        assert.ok(suggestions.length > 0, 'Should have suggestions for missing companions');
      }
    });
  });

  describe('getAutoSpawnSuggestions - depth limit', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.AUTO_COMPANION_SPAWN;
      process.env.AUTO_COMPANION_SPAWN = 'on';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_COMPANION_SPAWN;
      } else {
        process.env.AUTO_COMPANION_SPAWN = originalEnv;
      }
    });

    it('should respect maxDepth limit', () => {
      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });

      const suggestions1 = getAutoSpawnSuggestions(result, { maxDepth: 2, currentDepth: 0 });
      const suggestions2 = getAutoSpawnSuggestions(result, { maxDepth: 2, currentDepth: 2 });

      // At depth 0, should get suggestions
      if (result.required.some(c => !c.exists)) {
        assert.ok(suggestions1.length > 0);
      }

      // At depth 2 (maxDepth), should get no suggestions
      assert.deepStrictEqual(suggestions2, []);
    });

    it('should respect maxPerEvent limit', () => {
      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });

      const suggestions = getAutoSpawnSuggestions(result, { maxPerEvent: 2 });

      assert.ok(suggestions.length <= 2, 'Should not exceed maxPerEvent');
    });
  });

  describe('getAutoSpawnSuggestions - cycle detection', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.AUTO_COMPANION_SPAWN;
      process.env.AUTO_COMPANION_SPAWN = 'on';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_COMPANION_SPAWN;
      } else {
        process.env.AUTO_COMPANION_SPAWN = originalEnv;
      }
    });

    it('should detect cycles and skip already spawned types', () => {
      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });

      const spawnedTypes = new Set(['catalog-entry']);
      const suggestions = getAutoSpawnSuggestions(result, { spawnedTypes });

      // Should not suggest catalog-entry again
      const hasCatalogEntry = suggestions.some(s => s.companionType === 'catalog-entry');
      assert.strictEqual(hasCatalogEntry, false, 'Should not suggest already spawned type');
    });
  });

  describe('getAutoSpawnSuggestions - suggestion structure', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.AUTO_COMPANION_SPAWN;
      process.env.AUTO_COMPANION_SPAWN = 'on';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUTO_COMPANION_SPAWN;
      } else {
        process.env.AUTO_COMPANION_SPAWN = originalEnv;
      }
    });

    it('should return structured suggestions', () => {
      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });
      const suggestions = getAutoSpawnSuggestions(result);

      if (suggestions.length > 0) {
        const suggestion = suggestions[0];

        assert.ok(suggestion.companionType);
        assert.strictEqual(suggestion.artifactType, 'skill');
        assert.strictEqual(suggestion.artifactName, 'nonexistent-skill');
        assert.ok(suggestion.description);
        assert.ok(typeof suggestion.depth === 'number');
      }
    });

    it('should only suggest missing required companions', () => {
      const result = checkCompanions('skill', 'nonexistent-skill', { projectRoot: PROJECT_ROOT });
      const suggestions = getAutoSpawnSuggestions(result);

      // All suggestions should come from required companions
      for (const suggestion of suggestions) {
        const isRequired = result.required.some(
          c => c.type === suggestion.companionType && !c.exists
        );
        assert.ok(isRequired, 'Suggestion should be from missing required companions');
      }
    });
  });
});
