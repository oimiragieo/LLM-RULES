'use strict';

/**
 * Tests for manifest.json schema validation and ecosystem checker integration.
 * Task M6: Add manifest.json to Skill Format
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../../.claude/schemas/skill-manifest.schema.json');

// ── Inline JSON Schema validator (no external deps) ──────────────────────────
/**
 * Minimal structural validator for skill-manifest.schema.json.
 * We avoid pulling in `ajv` to keep the test zero-dep.
 * Validates required fields, enum values, and array item types.
 */

const VALID_SKILL_TYPES = ['cognitive', 'executable', 'hybrid'];
const VALID_DEP_TYPES = ['runtime', 'cli', 'library', 'api', 'package-manager'];

function checkRequiredFields(manifest, errors) {
  const required = ['name', 'version', 'skillType'];
  for (const field of required) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }
}

function checkSkillType(manifest, errors) {
  if (manifest.skillType && !VALID_SKILL_TYPES.includes(manifest.skillType)) {
    errors.push(
      `Invalid skillType "${manifest.skillType}". Must be one of: ${VALID_SKILL_TYPES.join(', ')}`
    );
  }
}

function checkExternalDependencies(manifest, errors) {
  if (manifest.externalDependencies === undefined) return;
  if (!Array.isArray(manifest.externalDependencies)) {
    errors.push('externalDependencies must be an array');
    return;
  }
  for (const dep of manifest.externalDependencies) {
    if (typeof dep.name !== 'string' || dep.name.length === 0) {
      errors.push('Each externalDependency must have a non-empty name');
    }
    if (dep.type && !VALID_DEP_TYPES.includes(dep.type)) {
      errors.push(`Invalid dependency type "${dep.type}"`);
    }
  }
}

function checkNpmDependencies(manifest, errors) {
  if (manifest.npmDependencies === undefined) return;
  if (!Array.isArray(manifest.npmDependencies)) {
    errors.push('npmDependencies must be an array');
    return;
  }
  for (const dep of manifest.npmDependencies) {
    if (typeof dep.package !== 'string' || dep.package.length === 0) {
      errors.push('Each npmDependency must have a non-empty package name');
    }
  }
}

function checkApis(manifest, errors) {
  if (manifest.apis === undefined) return;
  if (!Array.isArray(manifest.apis)) {
    errors.push('apis must be an array');
    return;
  }
  for (const api of manifest.apis) {
    if (typeof api.name !== 'string' || api.name.length === 0) {
      errors.push('Each api must have a non-empty name');
    }
  }
}

function checkGithubRepos(manifest, errors) {
  if (manifest.githubRepos === undefined) return;
  if (!Array.isArray(manifest.githubRepos)) {
    errors.push('githubRepos must be an array');
    return;
  }
  for (const repo of manifest.githubRepos) {
    if (typeof repo.url !== 'string' || repo.url.length === 0) {
      errors.push('Each githubRepo must have a non-empty url');
    }
  }
}

function checkDateFields(manifest, errors) {
  if (manifest.lastResearchDate !== undefined) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(manifest.lastResearchDate)) {
      errors.push('lastResearchDate must be in YYYY-MM-DD format');
    }
  }
  if (manifest.staleAfterDays !== undefined) {
    if (typeof manifest.staleAfterDays !== 'number' || manifest.staleAfterDays < 0) {
      errors.push('staleAfterDays must be a non-negative number');
    }
  }
}

function validateManifest(manifest) {
  const errors = [];
  checkRequiredFields(manifest, errors);
  checkSkillType(manifest, errors);
  checkExternalDependencies(manifest, errors);
  checkNpmDependencies(manifest, errors);
  checkApis(manifest, errors);
  checkGithubRepos(manifest, errors);
  checkDateFields(manifest, errors);
  return { valid: errors.length === 0, errors };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manifest-test-'));
}

function removeTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── Schema file existence ─────────────────────────────────────────────────────

describe('skill-manifest.schema.json', () => {
  test('schema file exists at .claude/schemas/skill-manifest.schema.json', () => {
    assert.ok(fs.existsSync(SCHEMA_PATH), `Schema file not found at ${SCHEMA_PATH}`);
  });

  test('schema file is valid JSON', () => {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    }, 'Schema file must be valid JSON');
    assert.ok(parsed, 'Parsed schema must be truthy');
  });

  test('schema has required JSON Schema properties', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    assert.ok(schema.$schema, 'Schema must have a $schema field');
    assert.ok(schema.title, 'Schema must have a title field');
    assert.ok(schema.properties, 'Schema must have properties field');
    assert.deepStrictEqual(schema.type, 'object', 'Schema type must be "object"');
  });

  test('schema declares name, version, skillType as required', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    assert.ok(Array.isArray(schema.required), 'Schema must have required array');
    assert.ok(schema.required.includes('name'), 'name must be required');
    assert.ok(schema.required.includes('version'), 'version must be required');
    assert.ok(schema.required.includes('skillType'), 'skillType must be required');
  });

  test('schema defines skillType as enum with cognitive/executable/hybrid', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const skillTypeProp = schema.properties.skillType;
    assert.ok(skillTypeProp, 'Schema must define skillType property');
    assert.ok(Array.isArray(skillTypeProp.enum), 'skillType must have enum');
    assert.ok(skillTypeProp.enum.includes('cognitive'), 'enum must include cognitive');
    assert.ok(skillTypeProp.enum.includes('executable'), 'enum must include executable');
    assert.ok(skillTypeProp.enum.includes('hybrid'), 'enum must include hybrid');
  });
});

// ── Manifest validation logic ─────────────────────────────────────────────────

describe('manifest validation', () => {
  test('valid minimal manifest passes validation', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('missing name fails validation', () => {
    const manifest = { version: '1.0.0', skillType: 'cognitive' };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some(e => e.includes('name')),
      'Should report missing name'
    );
  });

  test('missing version fails validation', () => {
    const manifest = { name: 'tdd', skillType: 'cognitive' };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('version')));
  });

  test('missing skillType fails validation', () => {
    const manifest = { name: 'tdd', version: '1.0.0' };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('skillType')));
  });

  test('invalid skillType fails validation', () => {
    const manifest = { name: 'tdd', version: '1.0.0', skillType: 'unknown' };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('skillType')));
  });

  test('valid externalDependencies array passes validation', () => {
    const manifest = {
      name: 'security-architect',
      version: '1.0.0',
      skillType: 'executable',
      externalDependencies: [
        { name: 'semgrep', type: 'cli', installHint: 'pip install semgrep' },
        { name: 'trufflehog', type: 'cli', installHint: 'brew install trufflehog' },
      ],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('externalDependency with invalid type fails validation', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      skillType: 'executable',
      externalDependencies: [{ name: 'tool', type: 'invalid-type' }],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('dependency type')));
  });

  test('externalDependency without name fails validation', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      skillType: 'executable',
      externalDependencies: [{ type: 'cli' }],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  test('valid npmDependencies array passes validation', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      npmDependencies: [
        { package: 'node', versionRange: '>=22.5.0', type: 'runtime' },
        { package: 'pnpm', versionRange: '>=9.0.0', type: 'package-manager' },
      ],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('npmDependency without package name fails validation', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      npmDependencies: [{ versionRange: '>=22.5.0' }],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('package')));
  });

  test('valid githubRepos array passes validation', () => {
    const manifest = {
      name: 'security-architect',
      version: '1.0.0',
      skillType: 'executable',
      githubRepos: [
        { url: 'https://github.com/OWASP/CheatSheetSeries', purpose: 'security reference' },
      ],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('githubRepo without url fails validation', () => {
    const manifest = {
      name: 'test',
      version: '1.0.0',
      skillType: 'executable',
      githubRepos: [{ purpose: 'reference' }],
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('url')));
  });

  test('valid lastResearchDate in YYYY-MM-DD format passes', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      lastResearchDate: '2026-03-03',
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('invalid lastResearchDate format fails validation', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      lastResearchDate: '03/03/2026',
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('lastResearchDate')));
  });

  test('valid staleAfterDays number passes', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      staleAfterDays: 90,
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `Errors: ${result.errors.join(', ')}`);
  });

  test('negative staleAfterDays fails validation', () => {
    const manifest = {
      name: 'tdd',
      version: '1.0.0',
      skillType: 'cognitive',
      staleAfterDays: -1,
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('staleAfterDays')));
  });
});

// ── Real manifest files ──────────────────────────────────────────────────────

describe('real skill manifest files', () => {
  const PROJECT_ROOT = path.join(__dirname, '../../..');
  const SKILLS_ROOT = path.join(PROJECT_ROOT, '.claude', 'skills');

  test('tdd/manifest.json exists', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'tdd', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), `tdd manifest not found at ${manifestPath}`);
  });

  test('tdd/manifest.json is valid and passes manifest validation', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'tdd', 'manifest.json');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let manifest;
    assert.doesNotThrow(() => {
      manifest = JSON.parse(raw);
    }, 'tdd manifest.json must be valid JSON');

    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true, `tdd manifest errors: ${result.errors.join('; ')}`);
  });

  test('tdd/manifest.json has cognitive skillType', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'tdd', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.skillType, 'cognitive');
  });

  test('security-architect/manifest.json exists', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'security-architect', 'manifest.json');
    assert.ok(
      fs.existsSync(manifestPath),
      `security-architect manifest not found at ${manifestPath}`
    );
  });

  test('security-architect/manifest.json is valid and passes manifest validation', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'security-architect', 'manifest.json');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let manifest;
    assert.doesNotThrow(() => {
      manifest = JSON.parse(raw);
    }, 'security-architect manifest.json must be valid JSON');

    const result = validateManifest(manifest);
    assert.strictEqual(
      result.valid,
      true,
      `security-architect manifest errors: ${result.errors.join('; ')}`
    );
  });

  test('security-architect/manifest.json has executable skillType', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'security-architect', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(manifest.skillType, 'executable');
  });

  test('debugging/manifest.json exists', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'debugging', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), `debugging manifest not found at ${manifestPath}`);
  });

  test('debugging/manifest.json is valid and passes manifest validation', () => {
    const manifestPath = path.join(SKILLS_ROOT, 'debugging', 'manifest.json');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let manifest;
    assert.doesNotThrow(() => {
      manifest = JSON.parse(raw);
    }, 'debugging manifest.json must be valid JSON');

    const result = validateManifest(manifest);
    assert.strictEqual(
      result.valid,
      true,
      `debugging manifest errors: ${result.errors.join('; ')}`
    );
  });
});

// ── evaluate-skill manifest check integration ─────────────────────────────────

describe('evaluateSkill manifest.json check (optional/warning)', () => {
  const { evaluateSkill } = require('../../../.claude/tools/cli/validate-skill-ecosystem.cjs');

  test('evaluateSkill reports manifest.present=false when manifest.json is absent', () => {
    const root = makeTmpDir();
    const skillsRoot = path.join(root, '.claude', 'skills');

    fs.mkdirSync(path.join(skillsRoot, 'no-manifest'), { recursive: true });
    fs.writeFileSync(path.join(skillsRoot, 'no-manifest', 'SKILL.md'), '# no manifest');

    const result = evaluateSkill({ projectRoot: root, skillRelativePath: 'no-manifest' });

    // manifest.present should be false when manifest.json is absent
    assert.strictEqual(
      result.manifest.present,
      false,
      'manifest.present should be false when manifest.json is missing'
    );

    // Score should NOT be penalized — manifest is optional/warning only
    // A skill with only SKILL.md should have score = 5 (weight for skill.md)
    assert.strictEqual(result.score, 5, 'Score should not be affected by missing manifest');

    removeTmpDir(root);
  });

  test('evaluateSkill reports manifest.present=true when manifest.json exists', () => {
    const root = makeTmpDir();
    const skillsRoot = path.join(root, '.claude', 'skills');
    const skillPath = path.join(skillsRoot, 'with-manifest');

    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# with manifest');
    fs.writeFileSync(
      path.join(skillPath, 'manifest.json'),
      JSON.stringify({ name: 'with-manifest', version: '1.0.0', skillType: 'cognitive' })
    );

    const result = evaluateSkill({ projectRoot: root, skillRelativePath: 'with-manifest' });

    assert.strictEqual(
      result.manifest.present,
      true,
      'manifest.present should be true when manifest.json exists'
    );

    removeTmpDir(root);
  });

  test('evaluateSkill reports manifest.valid=true for valid manifest.json', () => {
    const root = makeTmpDir();
    const skillsRoot = path.join(root, '.claude', 'skills');
    const skillPath = path.join(skillsRoot, 'valid-manifest');

    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# valid manifest');
    fs.writeFileSync(
      path.join(skillPath, 'manifest.json'),
      JSON.stringify({
        name: 'valid-manifest',
        version: '1.0.0',
        skillType: 'cognitive',
        lastResearchDate: '2026-03-03',
        staleAfterDays: 90,
      })
    );

    const result = evaluateSkill({ projectRoot: root, skillRelativePath: 'valid-manifest' });

    assert.strictEqual(result.manifest.present, true);
    assert.strictEqual(result.manifest.valid, true);
    assert.strictEqual(result.manifest.errors.length, 0);

    removeTmpDir(root);
  });

  test('evaluateSkill reports manifest.valid=false for invalid manifest.json', () => {
    const root = makeTmpDir();
    const skillsRoot = path.join(root, '.claude', 'skills');
    const skillPath = path.join(skillsRoot, 'bad-manifest');

    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# bad manifest');
    // Missing required fields: version and skillType
    fs.writeFileSync(
      path.join(skillPath, 'manifest.json'),
      JSON.stringify({ name: 'bad-manifest' })
    );

    const result = evaluateSkill({ projectRoot: root, skillRelativePath: 'bad-manifest' });

    assert.strictEqual(result.manifest.present, true);
    assert.strictEqual(result.manifest.valid, false);
    assert.ok(result.manifest.errors.length > 0, 'Should have validation errors');

    // Score should still NOT be penalized for invalid manifest (warning only)
    assert.strictEqual(result.score, 5, 'Score should not be penalized for invalid manifest');

    removeTmpDir(root);
  });

  test('evaluateSkill reports manifest.valid=false for unparseable manifest.json', () => {
    const root = makeTmpDir();
    const skillsRoot = path.join(root, '.claude', 'skills');
    const skillPath = path.join(skillsRoot, 'broken-json');

    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), '# broken json');
    fs.writeFileSync(path.join(skillPath, 'manifest.json'), '{ not valid json ');

    const result = evaluateSkill({ projectRoot: root, skillRelativePath: 'broken-json' });

    assert.strictEqual(result.manifest.present, true);
    assert.strictEqual(result.manifest.valid, false);
    assert.ok(
      result.manifest.errors.some(e => e.includes('parse') || e.includes('JSON')),
      'Should report JSON parse error'
    );

    removeTmpDir(root);
  });
});
