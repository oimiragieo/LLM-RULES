#!/usr/bin/env node
/**
 * Tests for enterprise-bundle-validator.cjs
 *
 * TDD RED phase: Tests written before implementation.
 * Validates that skills have complete enterprise bundles
 * (scripts, hooks, schemas, rules, commands, templates, references).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Module under test
const {
  validateEnterpriseBundle,
  ENTERPRISE_COMPONENTS,
} = require('../../../.claude/lib/creators/enterprise-bundle-validator.cjs');

// Test fixtures directory
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-enterprise-bundle');

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
 * Create a fake skill directory structure for testing.
 * @param {string} skillName
 * @param {string[]} components - Array of relative paths to create
 */
function createFakeSkill(skillName, components = []) {
  const skillDir = path.join(TMP_DIR, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });

  // Always create SKILL.md
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: ' + skillName + '\ndescription: Test skill\n---\n# ' + skillName,
    'utf8'
  );

  for (const comp of components) {
    const fullPath = path.join(skillDir, comp);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '// placeholder', 'utf8');
  }
}

// =============================================================================
// validateEnterpriseBundle
// =============================================================================

describe('Enterprise Bundle Validator', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('returns complete: true when all components exist', () => {
    createFakeSkill('full-skill', [
      'scripts/main.cjs',
      'hooks/pre-execute.cjs',
      'hooks/post-execute.cjs',
      'schemas/input.schema.json',
      'schemas/output.schema.json',
      'rules/full-skill.md',
      'commands/full-skill.md',
      'templates/implementation-template.md',
      'references/research-requirements.md',
    ]);

    const result = validateEnterpriseBundle('full-skill', TMP_DIR);

    assert.equal(result.complete, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.score, '9/9');
    assert.equal(result.scoreNum, 9);
    assert.equal(result.scoreMax, 9);
  });

  it('returns complete: false with list of missing components', () => {
    createFakeSkill('partial-skill', [
      'scripts/main.cjs',
      'schemas/output.schema.json',
    ]);

    const result = validateEnterpriseBundle('partial-skill', TMP_DIR);

    assert.equal(result.complete, false);
    assert.ok(result.missing.length > 0);
    assert.ok(result.scoreNum < 9);
  });

  it('scores 0/9 for skill with only SKILL.md', () => {
    createFakeSkill('bare-skill', []);

    const result = validateEnterpriseBundle('bare-skill', TMP_DIR);

    assert.equal(result.complete, false);
    assert.equal(result.scoreNum, 0);
    assert.equal(result.score, '0/9');
    assert.equal(result.missing.length, 9);
  });

  it('scores 9/9 for fully-scaffolded skill', () => {
    // Use real skill if it exists, otherwise test with fake
    const realSkillDir = path.join(PROJECT_ROOT, '.claude', 'skills', 'accessibility');
    if (fs.existsSync(realSkillDir)) {
      const result = validateEnterpriseBundle('accessibility', PROJECT_ROOT);
      assert.equal(result.scoreNum, 9);
      assert.equal(result.complete, true);
    } else {
      // Fallback: create full fake skill
      createFakeSkill('fake-full', [
        'scripts/main.cjs',
        'hooks/pre-execute.cjs',
        'hooks/post-execute.cjs',
        'schemas/input.schema.json',
        'schemas/output.schema.json',
        'rules/fake-full.md',
        'commands/fake-full.md',
        'templates/implementation-template.md',
        'references/research-requirements.md',
      ]);
      const result = validateEnterpriseBundle('fake-full', TMP_DIR);
      assert.equal(result.scoreNum, 9);
      assert.equal(result.complete, true);
    }
  });

  it('handles nested skill paths (e.g., scientific-skills/biopython)', () => {
    const nestedName = 'scientific-skills/biopython';
    const nestedDir = path.join(TMP_DIR, '.claude', 'skills', nestedName);
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, 'SKILL.md'),
      '---\nname: biopython\ndescription: Bio\n---\n# biopython',
      'utf8'
    );
    fs.mkdirSync(path.join(nestedDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'scripts', 'main.cjs'), '// bio', 'utf8');

    const result = validateEnterpriseBundle(nestedName, TMP_DIR);

    assert.equal(typeof result.complete, 'boolean');
    assert.equal(result.complete, false);
    assert.equal(result.scoreNum, 1); // only scripts/main.cjs
  });

  it('lists existing components accurately', () => {
    createFakeSkill('tracked-skill', [
      'scripts/main.cjs',
      'schemas/output.schema.json',
      'commands/tracked-skill.md',
    ]);

    const result = validateEnterpriseBundle('tracked-skill', TMP_DIR);

    assert.ok(result.existing.length === 3);
    assert.ok(result.existing.some(c => c.includes('scripts/main.cjs')));
    assert.ok(result.existing.some(c => c.includes('schemas/output.schema.json')));
    assert.ok(result.existing.some(c => c.includes('commands/')));
  });

  it('returns actionable missing list with expected paths', () => {
    createFakeSkill('incomplete-skill', ['scripts/main.cjs']);

    const result = validateEnterpriseBundle('incomplete-skill', TMP_DIR);

    // Missing list should contain component names
    assert.ok(result.missing.length > 0);
    for (const item of result.missing) {
      assert.ok(typeof item === 'string');
      assert.ok(item.length > 0);
    }
    // Should include schemas, hooks, etc.
    assert.ok(result.missing.some(m => m.includes('hooks/')));
    assert.ok(result.missing.some(m => m.includes('schemas/')));
  });

  it('returns skillDir in result', () => {
    createFakeSkill('path-skill', []);

    const result = validateEnterpriseBundle('path-skill', TMP_DIR);

    assert.ok(result.skillDir);
    assert.ok(result.skillDir.includes('path-skill'));
  });

  it('returns error for non-existent skill', () => {
    const result = validateEnterpriseBundle('nonexistent-skill-xyz', TMP_DIR);

    assert.equal(result.complete, false);
    assert.equal(result.scoreNum, 0);
    assert.ok(result.error);
  });
});

describe('ENTERPRISE_COMPONENTS', () => {
  it('exports the component definitions array', () => {
    assert.ok(Array.isArray(ENTERPRISE_COMPONENTS));
    assert.ok(ENTERPRISE_COMPONENTS.length === 9);

    for (const comp of ENTERPRISE_COMPONENTS) {
      assert.ok(comp.name, 'component should have a name');
      assert.ok(comp.type, 'component should have a type');
      assert.ok(typeof comp.required === 'boolean', 'component should have required flag');
    }
  });
});
