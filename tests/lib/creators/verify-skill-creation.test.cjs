#!/usr/bin/env node
/**
 * Tests for verifySkillCreation() in creator-commons.cjs
 *
 * TDD RED phase: All tests written before implementation.
 * Task M3 from creator-pipeline-improvements-plan-2026-02-17.md
 *
 * Tests:
 * 1. Verifies SKILL.md exists in skill directory -> result.passed includes 'SKILL.md exists'
 * 2. Fails when SKILL.md missing -> result.failed includes 'SKILL.md'
 * 3. Validates skill name is lowercase kebab-case (pass and fail cases)
 * 4. Checks skill appears in skill-catalog.md -> result.passed includes 'catalog'
 * 5. Reports missing catalog entry -> result.failed includes 'catalog'
 * 6. Validates skill content against skill-definition schema
 * 7. Checks at least one agent has skill assigned -> result.passed includes 'agent assignment'
 * 8. Reports when no agent has skill assigned -> result.warnings includes 'agent assignment'
 * 9. Returns summary with passedCount, failedCount, warningsCount numeric properties
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Module under test — verifySkillCreation does not exist yet (RED phase)
const { verifySkillCreation } = require('../../../.claude/lib/creators/creator-commons.cjs');

// Test fixtures
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-verify-skill-creation');
const MOCK_SKILLS_DIR = path.join(TMP_DIR, 'skills');
const MOCK_CATALOG_PATH = path.join(TMP_DIR, 'skill-catalog.md');
const MOCK_REGISTRY_PATH = path.join(TMP_DIR, 'agent-registry.json');

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(MOCK_SKILLS_DIR)) {
    fs.mkdirSync(MOCK_SKILLS_DIR, { recursive: true });
  }
}

function cleanTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

/**
 * Creates a mock SKILL.md file for a given skill name.
 * @param {string} skillName
 * @param {boolean} [withProvenance=true]
 */
function createMockSkillMd(skillName, withProvenance = true) {
  const skillDir = path.join(MOCK_SKILLS_DIR, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
  const provenanceLine = withProvenance
    ? '<!-- Agent: developer | Task: #5 | Session: 2026-02-17 -->\n'
    : '';
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `${provenanceLine}# ${skillName}\n\nA test skill for ${skillName}.\n`
  );
}

/**
 * Creates a mock skill directory WITHOUT a SKILL.md file (empty dir).
 * @param {string} skillName
 */
function createEmptySkillDir(skillName) {
  const skillDir = path.join(MOCK_SKILLS_DIR, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }
}

/**
 * Creates a mock skill catalog that includes a given skill name.
 * @param {string} skillName
 */
function createCatalogWithEntry(skillName) {
  fs.writeFileSync(
    MOCK_CATALOG_PATH,
    `# Skill Catalog\n\n| Skill | Description |\n| --- | --- |\n| ${skillName} | A test skill |\n`
  );
}

/**
 * Creates a mock skill catalog that does NOT include the skill.
 */
function createCatalogWithoutEntry() {
  fs.writeFileSync(
    MOCK_CATALOG_PATH,
    '# Skill Catalog\n\n| Skill | Description |\n| --- | --- |\n| other-skill | Not the one we want |\n'
  );
}

/**
 * Creates a mock agent registry where an agent has the skill assigned.
 * @param {string} skillName
 */
function createRegistryWithSkillAssigned(skillName) {
  const registry = {
    agents: [
      {
        name: 'developer',
        type: 'developer',
        description: 'Core developer agent',
        skills: [skillName, 'tdd', 'debugging'],
      },
    ],
  };
  fs.writeFileSync(MOCK_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Creates a mock agent registry where NO agent has the skill assigned.
 */
function createRegistryWithoutSkillAssigned() {
  const registry = {
    agents: [
      {
        name: 'developer',
        type: 'developer',
        description: 'Core developer agent',
        skills: ['tdd', 'debugging'],
      },
    ],
  };
  fs.writeFileSync(MOCK_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// =============================================================================
// verifySkillCreation
// =============================================================================

describe('verifySkillCreation', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('verifies SKILL.md exists in skill directory', () => {
    // Setup: create a skill directory with SKILL.md
    createMockSkillMd('test-skill');
    createCatalogWithEntry('test-skill');
    createRegistryWithSkillAssigned('test-skill');

    const result = verifySkillCreation('test-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(Array.isArray(result.passed), 'result.passed should be an array');
    assert.ok(
      result.passed.some(p => p.includes('SKILL.md exists')),
      `Expected result.passed to include 'SKILL.md exists', got: ${JSON.stringify(result.passed)}`
    );
  });

  it('fails when SKILL.md is missing from skill directory', () => {
    // Setup: create an empty skill directory (no SKILL.md)
    createEmptySkillDir('missing-skill');

    const result = verifySkillCreation('missing-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(Array.isArray(result.failed), 'result.failed should be an array');
    assert.ok(
      result.failed.some(f => f.includes('SKILL.md')),
      `Expected result.failed to include a message about SKILL.md, got: ${JSON.stringify(result.failed)}`
    );
  });

  it('validates skill name is lowercase kebab-case', () => {
    // Test pass case: valid kebab-case name
    createMockSkillMd('my-cool-skill');
    const passResult = verifySkillCreation('my-cool-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      passResult.passed.some(
        p => p.toLowerCase().includes('name') && p.toLowerCase().includes('format')
      ),
      `Expected valid name to produce passed entry with 'name format', got: ${JSON.stringify(passResult.passed)}`
    );

    // Test fail case: invalid PascalCase name (no directory needed — name check runs first)
    const failResult = verifySkillCreation('MyBadSkill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      failResult.failed.some(
        f => f.toLowerCase().includes('name') && f.toLowerCase().includes('format')
      ),
      `Expected invalid name to produce failed entry with 'name format', got: ${JSON.stringify(failResult.failed)}`
    );
  });

  it('checks skill appears in skill-catalog.md', () => {
    // Setup: create skill and catalog with the skill listed
    createMockSkillMd('catalog-skill');
    createCatalogWithEntry('catalog-skill');
    createRegistryWithoutSkillAssigned();

    const result = verifySkillCreation('catalog-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      result.passed.some(p => p.toLowerCase().includes('catalog')),
      `Expected result.passed to include a 'catalog' entry, got: ${JSON.stringify(result.passed)}`
    );
  });

  it('reports missing skill-catalog.md entry', () => {
    // Setup: create skill but catalog does NOT include it
    createMockSkillMd('uncatalogued-skill');
    createCatalogWithoutEntry();
    createRegistryWithoutSkillAssigned();

    const result = verifySkillCreation('uncatalogued-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      result.failed.some(f => f.toLowerCase().includes('catalog')),
      `Expected result.failed to include a 'catalog' message, got: ${JSON.stringify(result.failed)}`
    );
  });

  it('validates skill content against skill-definition schema', () => {
    // Setup: create a valid skill with a proper SKILL.md
    createMockSkillMd('schema-skill');
    createCatalogWithEntry('schema-skill');
    createRegistryWithoutSkillAssigned();

    const result = verifySkillCreation('schema-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    // Schema validation result should appear somewhere in results (passed or warning)
    const allResults = [...result.passed, ...result.failed, ...result.warnings];
    const hasSchemaResult = allResults.some(r => r.toLowerCase().includes('schema'));

    assert.ok(
      hasSchemaResult,
      `Expected a schema-related entry in results, got: ${JSON.stringify(allResults)}`
    );
  });

  it('checks at least one agent has the skill assigned', () => {
    // Setup: create skill and a registry where an agent has the skill
    createMockSkillMd('assigned-skill');
    createCatalogWithEntry('assigned-skill');
    createRegistryWithSkillAssigned('assigned-skill');

    const result = verifySkillCreation('assigned-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      result.passed.some(p => p.toLowerCase().includes('agent assignment')),
      `Expected result.passed to include 'agent assignment', got: ${JSON.stringify(result.passed)}`
    );
  });

  it('reports when no agent has skill assigned', () => {
    // Setup: create skill and a registry where NO agent has the skill
    createMockSkillMd('unassigned-skill');
    createCatalogWithEntry('unassigned-skill');
    createRegistryWithoutSkillAssigned();

    const result = verifySkillCreation('unassigned-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    assert.ok(
      result.warnings.some(w => w.toLowerCase().includes('agent assignment')),
      `Expected result.warnings to include 'agent assignment', got: ${JSON.stringify(result.warnings)}`
    );
  });

  it('returns summary with total passed/failed/warnings counts', () => {
    // Setup: create a complete valid skill
    createMockSkillMd('count-skill');
    createCatalogWithEntry('count-skill');
    createRegistryWithSkillAssigned('count-skill');

    const result = verifySkillCreation('count-skill', {
      skillsDir: MOCK_SKILLS_DIR,
      catalogPath: MOCK_CATALOG_PATH,
      registryPath: MOCK_REGISTRY_PATH,
    });

    // Must have numeric count properties
    assert.ok(
      typeof result.passedCount === 'number',
      `result.passedCount must be a number, got: ${typeof result.passedCount}`
    );
    assert.ok(
      typeof result.failedCount === 'number',
      `result.failedCount must be a number, got: ${typeof result.failedCount}`
    );
    assert.ok(
      typeof result.warningsCount === 'number',
      `result.warningsCount must be a number, got: ${typeof result.warningsCount}`
    );

    // Counts must match actual array lengths
    assert.strictEqual(
      result.passedCount,
      result.passed.length,
      'passedCount must equal passed.length'
    );
    assert.strictEqual(
      result.failedCount,
      result.failed.length,
      'failedCount must equal failed.length'
    );
    assert.strictEqual(
      result.warningsCount,
      result.warnings.length,
      'warningsCount must equal warnings.length'
    );
  });
});
