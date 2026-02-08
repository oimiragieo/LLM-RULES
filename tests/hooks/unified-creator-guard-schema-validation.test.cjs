#!/usr/bin/env node
/**
 * Tests for unified-creator-guard schema validation (Step 7)
 *
 * Tests the validateArtifactContent function that validates
 * artifact content against schemas at write time (warn-only mode).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Module under test
const guard = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

// =============================================================================
// validateArtifactContent
// =============================================================================

describe('validateArtifactContent', () => {
  it('is exported as a function', () => {
    assert.strictEqual(
      typeof guard.validateArtifactContent,
      'function',
      'validateArtifactContent should be exported'
    );
  });

  it('returns valid:true for skill with valid frontmatter fields', () => {
    const content = JSON.stringify({
      name: 'test-skill',
      description: 'A test skill that does something useful for testing purposes',
      version: '1.0',
    });

    const result = guard.validateArtifactContent('skill', content);

    assert.strictEqual(result.valid, true, 'valid skill content should pass');
    assert.ok(Array.isArray(result.errors));
    assert.strictEqual(result.errors.length, 0);
  });

  it('returns valid:false for skill missing required name field', () => {
    const content = JSON.stringify({
      description: 'A test skill that does something useful for testing purposes',
    });

    const result = guard.validateArtifactContent('skill', content);

    assert.strictEqual(result.valid, false, 'skill without name should fail');
    assert.ok(result.errors.length > 0, 'should have errors');
    assert.ok(
      result.errors.some(e => e.includes('name')),
      'error should mention missing name field'
    );
  });

  it('returns valid:true for artifact types with no schema', () => {
    const content = '{ "anything": "goes" }';

    const result = guard.validateArtifactContent('config:settings', content);

    assert.strictEqual(result.valid, true, 'no-schema type should pass');
  });

  it('produces warning mode output (never blocks)', () => {
    // Even invalid content should produce a warning, not a block
    const content = JSON.stringify({
      // missing required fields
      version: '1.0',
    });

    const result = guard.validateArtifactContent('skill', content);

    // The function should return the result but the guard should not block
    assert.strictEqual(result.mode, 'warn', 'validation should be in warn mode');
  });

  it('skips validation when content is not parseable JSON', () => {
    const content = '# This is markdown, not JSON\n\nSome content here.';

    const result = guard.validateArtifactContent('skill', content);

    // Non-JSON content should skip validation gracefully
    assert.strictEqual(result.valid, true, 'non-JSON content should pass (skip validation)');
  });

  it('validates JSON schema artifacts correctly', () => {
    const content = JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Test Schema',
      type: 'object',
    });

    // Schema type has no validation (self-referential)
    const result = guard.validateArtifactContent('schema', content);
    assert.strictEqual(result.valid, true);
  });
});

// =============================================================================
// SCHEMA_MAP export
// =============================================================================

describe('SCHEMA_MAP', () => {
  it('is exported and contains mappings for known types', () => {
    assert.ok(guard.SCHEMA_MAP, 'SCHEMA_MAP should be exported');
    assert.ok('skill' in guard.SCHEMA_MAP, 'should have skill mapping');
    assert.ok('agent' in guard.SCHEMA_MAP, 'should have agent mapping');
    assert.ok('hook' in guard.SCHEMA_MAP, 'should have hook mapping');
    assert.ok('workflow' in guard.SCHEMA_MAP, 'should have workflow mapping');
  });

  it('maps skill to skill-definition.schema.json', () => {
    assert.strictEqual(guard.SCHEMA_MAP.skill, 'skill-definition.schema.json');
  });

  it('maps config:settings to null (no schema)', () => {
    assert.strictEqual(guard.SCHEMA_MAP['config:settings'], null);
  });
});
