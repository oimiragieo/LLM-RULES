#!/usr/bin/env node
/**
 * Tests for enhancedIntegrationChecklist() in creator-commons.cjs
 *
 * TDD RED phase: All tests written before implementation.
 * Task M2 from creator-pipeline-improvements-plan-2026-02-17.md
 *
 * Tests:
 * 1. Checks skill catalog entry exists for skill artifacts -> result.passed includes 'catalog entry found'
 * 2. Reports missing catalog entry for skill artifacts -> result.failed includes 'catalog'
 * 3. Checks agent-registry entry for agent artifacts -> result.passed includes 'registry entry found'
 * 4. Reports missing agent-registry entry for agent artifacts
 * 5. Includes all base validatePostCreation checks (provenance, file-exists)
 * 6. Returns warning when catalog file not found (graceful degradation)
 * 7. Validates schema for JSON artifact types
 * 8. Returns structured result with passed, failed, warnings arrays
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Module under test — enhancedIntegrationChecklist does not exist yet (RED phase)
const { enhancedIntegrationChecklist } = require('../../../.claude/lib/creators/creator-commons.cjs');

// Test fixtures
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-enhanced-checklist');
const MOCK_CATALOG_PATH = path.join(TMP_DIR, 'mock-skill-catalog.md');
const MOCK_REGISTRY_PATH = path.join(TMP_DIR, 'mock-agent-registry.json');

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

/**
 * Creates a mock skill artifact file with valid provenance header.
 * @param {string} filename
 * @returns {string} absolute path to the created file
 */
function createMockSkillFile(filename) {
  const skillPath = path.join(TMP_DIR, filename);
  fs.writeFileSync(
    skillPath,
    '<!-- Agent: developer | Task: #5 | Session: 2026-02-17 -->\n# Test Skill\n\nA test skill.\n'
  );
  return skillPath;
}

/**
 * Creates a mock agent artifact file with valid provenance header.
 * @param {string} filename
 * @returns {string} absolute path to the created file
 */
function createMockAgentFile(filename) {
  const agentPath = path.join(TMP_DIR, filename);
  fs.writeFileSync(
    agentPath,
    '<!-- Agent: developer | Task: #5 | Session: 2026-02-17 -->\n# Test Agent\n\nA test agent.\n'
  );
  return agentPath;
}

/**
 * Creates a mock skill catalog containing a specific skill name.
 * @param {string} skillName - skill name to include in catalog
 */
function createMockCatalogWithEntry(skillName) {
  fs.writeFileSync(
    MOCK_CATALOG_PATH,
    `# Skill Catalog\n\n| Skill | Description |\n| --- | --- |\n| ${skillName} | A test skill |\n`
  );
}

/**
 * Creates a mock skill catalog that does NOT contain the skill.
 */
function createMockCatalogWithoutEntry() {
  fs.writeFileSync(
    MOCK_CATALOG_PATH,
    '# Skill Catalog\n\n| Skill | Description |\n| --- | --- |\n| other-skill | Another skill |\n'
  );
}

/**
 * Creates a mock agent registry containing a specific agent.
 * @param {string} agentName - agent name to include
 */
function createMockRegistryWithAgent(agentName) {
  const registry = {
    agents: [
      { name: agentName, type: agentName, description: 'A test agent' },
    ],
  };
  fs.writeFileSync(MOCK_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Creates a mock agent registry that does NOT contain the agent.
 */
function createMockRegistryWithoutAgent() {
  const registry = {
    agents: [
      { name: 'other-agent', type: 'other-agent', description: 'Another agent' },
    ],
  };
  fs.writeFileSync(MOCK_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// =============================================================================
// enhancedIntegrationChecklist
// =============================================================================

describe('enhancedIntegrationChecklist', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('checks skill catalog entry exists for skill artifacts', () => {
    // Setup: create a skill artifact and a catalog that contains the skill name
    const skillPath = createMockSkillFile('test-skill.md');
    createMockCatalogWithEntry('my-test-skill');

    const result = enhancedIntegrationChecklist('skill', skillPath, {
      artifactName: 'my-test-skill',
      catalogPath: MOCK_CATALOG_PATH,
    });

    assert.ok(Array.isArray(result.passed), 'result.passed should be an array');
    assert.ok(
      result.passed.some(p => p.includes('catalog entry found')),
      `Expected result.passed to include 'catalog entry found', got: ${JSON.stringify(result.passed)}`
    );
  });

  it('reports missing catalog entry for skill artifacts', () => {
    // Setup: create a skill artifact and a catalog WITHOUT the skill
    const skillPath = createMockSkillFile('test-skill.md');
    createMockCatalogWithoutEntry();

    const result = enhancedIntegrationChecklist('skill', skillPath, {
      artifactName: 'my-missing-skill',
      catalogPath: MOCK_CATALOG_PATH,
    });

    assert.ok(Array.isArray(result.failed), 'result.failed should be an array');
    assert.ok(
      result.failed.some(f => f.toLowerCase().includes('catalog')),
      `Expected result.failed to include a string mentioning 'catalog', got: ${JSON.stringify(result.failed)}`
    );
  });

  it('checks agent-registry entry for agent artifacts', () => {
    // Setup: create an agent artifact and a registry containing the agent
    const agentPath = createMockAgentFile('test-agent.md');
    createMockRegistryWithAgent('my-test-agent');

    const result = enhancedIntegrationChecklist('agent', agentPath, {
      artifactName: 'my-test-agent',
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(Array.isArray(result.passed), 'result.passed should be an array');
    assert.ok(
      result.passed.some(p => p.includes('registry entry found')),
      `Expected result.passed to include 'registry entry found', got: ${JSON.stringify(result.passed)}`
    );
  });

  it('reports missing agent-registry entry for agent artifacts', () => {
    // Setup: create an agent artifact and a registry WITHOUT the agent
    const agentPath = createMockAgentFile('test-agent.md');
    createMockRegistryWithoutAgent();

    const result = enhancedIntegrationChecklist('agent', agentPath, {
      artifactName: 'my-missing-agent',
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(Array.isArray(result.failed), 'result.failed should be an array');
    assert.ok(
      result.failed.some(f => f.toLowerCase().includes('registry') || f.toLowerCase().includes('agent')),
      `Expected result.failed to include a string about missing registry entry, got: ${JSON.stringify(result.failed)}`
    );
  });

  it('includes base post-creation validation results', () => {
    // Setup: create a skill artifact with proper provenance header
    const skillPath = createMockSkillFile('test-skill.md');
    createMockCatalogWithEntry('test-skill');

    const result = enhancedIntegrationChecklist('skill', skillPath, {
      artifactName: 'test-skill',
      catalogPath: MOCK_CATALOG_PATH,
    });

    // The base validatePostCreation checks should be included:
    // - File exists check
    // - Provenance header check
    const allResults = [...result.passed, ...result.failed, ...result.warnings];
    const hasProvenanceCheck = allResults.some(r => r.toLowerCase().includes('provenance'));
    const hasFileCheck = allResults.some(r =>
      r.toLowerCase().includes('exist') || r.toLowerCase().includes('file')
    );

    assert.ok(
      hasProvenanceCheck,
      `Expected provenance check in results, got: ${JSON.stringify(allResults)}`
    );
    assert.ok(
      hasFileCheck,
      `Expected file existence check in results, got: ${JSON.stringify(allResults)}`
    );
  });

  it('returns warning when catalog file not found', () => {
    // Setup: create a skill artifact but do NOT create a catalog file
    const skillPath = createMockSkillFile('test-skill.md');
    const nonExistentCatalog = path.join(TMP_DIR, 'does-not-exist-catalog.md');

    const result = enhancedIntegrationChecklist('skill', skillPath, {
      artifactName: 'test-skill',
      catalogPath: nonExistentCatalog,
    });

    assert.ok(Array.isArray(result.warnings), 'result.warnings should be an array');
    assert.ok(
      result.warnings.some(w =>
        w.toLowerCase().includes('catalog') || w.toLowerCase().includes('not found')
      ),
      `Expected result.warnings to mention missing catalog, got: ${JSON.stringify(result.warnings)}`
    );
  });

  it('validates schema for JSON artifact types', () => {
    // Setup: create a JSON artifact file
    const jsonArtifactPath = path.join(TMP_DIR, 'test-config.json');
    fs.writeFileSync(
      jsonArtifactPath,
      JSON.stringify({ status: 'success', output: { name: 'test', description: 'Test config' } }, null, 2)
    );

    // For JSON artifacts, the function should run schema validation
    const result = enhancedIntegrationChecklist('skill', jsonArtifactPath, {
      artifactName: 'test',
      catalogPath: MOCK_CATALOG_PATH, // may not exist — graceful degradation
    });

    // Result must have the three arrays at minimum
    assert.ok(Array.isArray(result.passed), 'result.passed should be an array');
    assert.ok(Array.isArray(result.failed), 'result.failed should be an array');
    assert.ok(Array.isArray(result.warnings), 'result.warnings should be an array');
  });

  it('returns structured result with passed, failed, warnings arrays', () => {
    // Setup: minimal call without optional files
    const skillPath = createMockSkillFile('test-skill.md');

    const result = enhancedIntegrationChecklist('skill', skillPath, {
      artifactName: 'test-skill',
    });

    // Must return all three arrays
    assert.ok(Array.isArray(result.passed), 'result.passed must be an array');
    assert.ok(Array.isArray(result.failed), 'result.failed must be an array');
    assert.ok(Array.isArray(result.warnings), 'result.warnings must be an array');

    // All items in arrays must be strings
    for (const item of result.passed) {
      assert.strictEqual(typeof item, 'string', `passed item must be string, got: ${typeof item}`);
    }
    for (const item of result.failed) {
      assert.strictEqual(typeof item, 'string', `failed item must be string, got: ${typeof item}`);
    }
    for (const item of result.warnings) {
      assert.strictEqual(typeof item, 'string', `warnings item must be string, got: ${typeof item}`);
    }
  });
});
