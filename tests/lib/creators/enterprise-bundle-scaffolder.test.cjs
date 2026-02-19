#!/usr/bin/env node
/**
 * Tests for enterprise-bundle-scaffolder.cjs
 *
 * TDD RED phase: Tests written before implementation.
 * Validates scaffolding of missing enterprise bundle components.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Module under test
const {
  scaffoldMissingComponents,
} = require('../../../.claude/lib/creators/enterprise-bundle-scaffolder.cjs');

// Validator for verifying results
const {
  validateEnterpriseBundle,
} = require('../../../.claude/lib/creators/enterprise-bundle-validator.cjs');

// Test fixtures directory
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-enterprise-scaffolder');

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
 * Create a minimal skill directory with just SKILL.md.
 */
function createMinimalSkill(skillName, skillContent) {
  const skillDir = path.join(TMP_DIR, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const defaultContent = skillContent || [
    '---',
    'name: ' + skillName,
    'description: Test skill for ' + skillName,
    'tools: [Read, Write, Bash]',
    'best_practices:',
    '  - Follow TDD methodology',
    '  - Validate inputs at boundaries',
    '---',
    '',
    '# ' + skillName,
    '',
    '## Purpose',
    '',
    'This is a test skill.',
    '',
    '## Best Practices',
    '',
    '- Follow TDD',
    '- Validate inputs',
  ].join('\n');

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), defaultContent, 'utf8');
  return skillDir;
}

/**
 * Create a skill with some components already present.
 */
function createPartialSkill(skillName, existingComponents) {
  const skillDir = createMinimalSkill(skillName);
  for (const comp of existingComponents) {
    const fullPath = path.join(skillDir, comp);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '// existing content - DO NOT OVERWRITE', 'utf8');
  }
  return skillDir;
}

// =============================================================================
// scaffoldMissingComponents
// =============================================================================

describe('Enterprise Bundle Scaffolder', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('generates scripts/main.cjs from SKILL.md content', () => {
    createMinimalSkill('test-script-gen');

    const result = scaffoldMissingComponents('test-script-gen', TMP_DIR);

    assert.ok(result.created.some(f => f.includes('scripts/main.cjs')));

    const mainPath = path.join(TMP_DIR, '.claude', 'skills', 'test-script-gen', 'scripts', 'main.cjs');
    assert.ok(fs.existsSync(mainPath));

    const content = fs.readFileSync(mainPath, 'utf8');
    assert.ok(content.includes('test-script-gen'));
    assert.ok(content.includes('use strict') || content.includes("'use strict'"));
  });

  it('generates schemas/output.schema.json with status + output fields', () => {
    createMinimalSkill('test-schema-gen');

    const result = scaffoldMissingComponents('test-schema-gen', TMP_DIR);

    assert.ok(result.created.some(f => f.includes('schemas/output.schema.json')));

    const schemaPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-schema-gen', 'schemas', 'output.schema.json'
    );
    const content = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(content);

    assert.ok(schema.properties);
    assert.ok(schema.properties.ok || schema.properties.status);
    assert.ok(schema.properties.summary || schema.properties.output);
  });

  it('generates commands/<name>.md with Skill() delegation', () => {
    createMinimalSkill('test-cmd-gen');

    const result = scaffoldMissingComponents('test-cmd-gen', TMP_DIR);

    assert.ok(result.created.some(f => f.includes('commands/')));

    const cmdPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-cmd-gen', 'commands', 'test-cmd-gen.md'
    );
    const content = fs.readFileSync(cmdPath, 'utf8');

    assert.ok(content.includes('test-cmd-gen'));
    assert.ok(content.includes('disable-model-invocation') || content.includes('Invoke'));
  });

  it('generates templates/implementation-template.md from best practices', () => {
    createMinimalSkill('test-tpl-gen');

    const result = scaffoldMissingComponents('test-tpl-gen', TMP_DIR);

    assert.ok(result.created.some(f => f.includes('templates/')));

    const tplPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-tpl-gen', 'templates', 'implementation-template.md'
    );
    const content = fs.readFileSync(tplPath, 'utf8');

    assert.ok(content.includes('test-tpl-gen'));
    assert.ok(content.includes('TDD') || content.includes('Goal') || content.includes('Verification'));
  });

  it('generates references/research-requirements.md', () => {
    createMinimalSkill('test-ref-gen');

    const result = scaffoldMissingComponents('test-ref-gen', TMP_DIR);

    assert.ok(result.created.some(f => f.includes('references/')));

    const refPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-ref-gen', 'references', 'research-requirements.md'
    );
    const content = fs.readFileSync(refPath, 'utf8');

    assert.ok(content.includes('test-ref-gen'));
  });

  it('does NOT overwrite existing components', () => {
    const existingContent = '// existing content - DO NOT OVERWRITE';
    createPartialSkill('test-no-overwrite', ['scripts/main.cjs', 'schemas/output.schema.json']);

    const result = scaffoldMissingComponents('test-no-overwrite', TMP_DIR);

    // Should be skipped, not created
    assert.ok(result.skipped.some(f => f.includes('scripts/main.cjs')));
    assert.ok(result.skipped.some(f => f.includes('schemas/output.schema.json')));

    // Verify content was not overwritten
    const mainPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-no-overwrite', 'scripts', 'main.cjs'
    );
    const content = fs.readFileSync(mainPath, 'utf8');
    assert.equal(content, existingContent);
  });

  it('uses skill name and description in generated content', () => {
    createMinimalSkill('my-custom-skill', [
      '---',
      'name: my-custom-skill',
      'description: A specialized tool for custom operations',
      '---',
      '# my-custom-skill',
    ].join('\n'));

    const result = scaffoldMissingComponents('my-custom-skill', TMP_DIR);

    // Check main script uses skill name
    const mainPath = path.join(
      TMP_DIR, '.claude', 'skills', 'my-custom-skill', 'scripts', 'main.cjs'
    );
    const mainContent = fs.readFileSync(mainPath, 'utf8');
    assert.ok(mainContent.includes('my-custom-skill'));
  });

  it('generated main.cjs is valid Node.js (no syntax errors)', () => {
    createMinimalSkill('test-syntax');

    scaffoldMissingComponents('test-syntax', TMP_DIR);

    const mainPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-syntax', 'scripts', 'main.cjs'
    );
    const content = fs.readFileSync(mainPath, 'utf8');

    // Strip shebang line before parsing (shebang is valid for Node.js but not for new Function)
    const strippedContent = content.replace(/^#!.*\n/, '');
    // Verify it parses without syntax error
    assert.doesNotThrow(() => {
      new Function(strippedContent);
    }, 'Generated main.cjs has syntax errors');
  });

  it('generated schema is valid JSON Schema', () => {
    createMinimalSkill('test-valid-schema');

    scaffoldMissingComponents('test-valid-schema', TMP_DIR);

    const schemaPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-valid-schema', 'schemas', 'output.schema.json'
    );
    const content = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(content);

    assert.ok(schema.$schema, 'should have $schema');
    assert.ok(schema.type, 'should have type');
    assert.ok(schema.properties, 'should have properties');
  });

  it('returns { created: string[], skipped: string[] }', () => {
    createPartialSkill('test-return-shape', ['scripts/main.cjs']);

    const result = scaffoldMissingComponents('test-return-shape', TMP_DIR);

    assert.ok(Array.isArray(result.created));
    assert.ok(Array.isArray(result.skipped));
    assert.ok(result.skipped.some(f => f.includes('scripts/main.cjs')));
    assert.ok(result.created.length > 0);
  });

  it('dryRun mode does not create files', () => {
    createMinimalSkill('test-dry-run');

    const result = scaffoldMissingComponents('test-dry-run', TMP_DIR, { dryRun: true });

    assert.ok(result.created.length > 0, 'should report what would be created');

    // Verify no files were actually created
    const mainPath = path.join(
      TMP_DIR, '.claude', 'skills', 'test-dry-run', 'scripts', 'main.cjs'
    );
    assert.ok(!fs.existsSync(mainPath), 'main.cjs should not exist in dry-run mode');
  });

  it('scaffolding a bare skill results in 9/9 validation score', () => {
    createMinimalSkill('test-full-scaffold');

    scaffoldMissingComponents('test-full-scaffold', TMP_DIR);

    const validation = validateEnterpriseBundle('test-full-scaffold', TMP_DIR);
    assert.equal(validation.scoreNum, 9);
    assert.equal(validation.complete, true);
  });
});
