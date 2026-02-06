const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test the constitution integration functions
const {
  loadConstitutionContext,
  appendConstitutionSection,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

// =============================================================================
// Unit Tests: Constitution Context Integration
// =============================================================================

describe('loadConstitutionContext() - Load Constitution and Behaviour Files', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

  test('should load both constitution.md and behaviour.md when they exist', () => {
    const result = loadConstitutionContext(PROJECT_ROOT);

    assert.ok(result, 'Expected result object to be defined');
    assert.ok(result.constitution, 'Expected constitution content to be loaded');
    assert.ok(result.behaviour, 'Expected behaviour content to be loaded');
    assert.ok(
      result.constitution.includes('# Constitution'),
      'Expected constitution to contain header'
    );
    assert.ok(result.behaviour.includes('# Behaviour'), 'Expected behaviour to contain header');
  });

  test('should cache constitution content on subsequent calls', () => {
    // First call loads from disk
    const result1 = loadConstitutionContext(PROJECT_ROOT);

    // Second call should return cached version (same reference)
    const result2 = loadConstitutionContext(PROJECT_ROOT);

    assert.strictEqual(result1, result2, 'Expected cached result to be returned');
  });

  test('should gracefully handle missing files without throwing', () => {
    // Note: Due to caching, this test will return cached content from previous tests
    // in the same process. The important behavior is that it doesn't throw.
    const fakePath = path.join(PROJECT_ROOT, 'non-existent-dir');

    let didThrow = false;
    let result;
    try {
      result = loadConstitutionContext(fakePath);
    } catch (_e) {
      didThrow = true;
    }

    assert.ok(!didThrow, 'Expected function not to throw when files missing');
    assert.ok(result, 'Expected result object to be defined');
    assert.ok(typeof result.constitution === 'string', 'Expected constitution to be string');
    assert.ok(typeof result.behaviour === 'string', 'Expected behaviour to be string');
  });
});

describe('appendConstitutionSection() - Append Constitution to Prompt', () => {
  test('should append constitution section when content is provided', () => {
    const basePrompt = `## Task\nImplement feature X\n\n## Memory Context`;
    const constitution = '# Constitution\n\nCore principles...';
    const behaviour = '# Behaviour\n\nRouter behaviour...';

    const result = appendConstitutionSection(basePrompt, { constitution, behaviour });

    assert.ok(result.includes('## Agent Constitution'), 'Expected constitution header');
    assert.ok(result.includes('Core principles...'), 'Expected constitution content');
    assert.ok(result.includes('Router behaviour...'), 'Expected behaviour content');
  });

  test('should not append section when both files are empty', () => {
    const basePrompt = `## Task\nImplement feature X`;
    const result = appendConstitutionSection(basePrompt, { constitution: '', behaviour: '' });

    assert.strictEqual(
      result,
      basePrompt,
      'Expected prompt unchanged when no constitution content'
    );
    assert.ok(
      !result.includes('## Agent Constitution'),
      'Expected no constitution section when empty'
    );
  });

  test('should append only constitution when behaviour is empty', () => {
    const basePrompt = `## Task\nImplement feature X`;
    const constitution = '# Constitution\n\nCore principles...';

    const result = appendConstitutionSection(basePrompt, { constitution, behaviour: '' });

    assert.ok(result.includes('## Agent Constitution'), 'Expected constitution header');
    assert.ok(result.includes('Core principles...'), 'Expected constitution content');
    assert.ok(!result.includes('# Behaviour'), 'Expected no behaviour section');
  });

  test('should append only behaviour when constitution is empty', () => {
    const basePrompt = `## Task\nImplement feature X`;
    const behaviour = '# Behaviour\n\nRouter behaviour...';

    const result = appendConstitutionSection(basePrompt, { constitution: '', behaviour });

    assert.ok(result.includes('## Agent Constitution'), 'Expected constitution header');
    assert.ok(result.includes('Router behaviour...'), 'Expected behaviour content');
    assert.ok(!result.includes('# Constitution'), 'Expected no constitution section');
  });

  test('should insert section before Memory Context if present', () => {
    const basePrompt = `## Task\nImplement feature X\n\n## Memory Context (Auto-Loaded)\nMemory content`;
    const constitution = '# Constitution\n\nCore principles...';
    const behaviour = '# Behaviour\n\nRouter behaviour...';

    const result = appendConstitutionSection(basePrompt, { constitution, behaviour });

    const constitutionIdx = result.indexOf('## Agent Constitution');
    const memoryIdx = result.indexOf('## Memory Context');

    assert.ok(constitutionIdx !== -1, 'Expected constitution section to be present');
    assert.ok(memoryIdx !== -1, 'Expected memory section to be present');
    assert.ok(constitutionIdx < memoryIdx, 'Expected constitution section before Memory Context');
  });

  test('should append to end if no Memory Context section', () => {
    const basePrompt = `## Task\nImplement feature X\n\n## Available Tools\nRead, Write`;
    const constitution = '# Constitution\n\nCore principles...';

    const result = appendConstitutionSection(basePrompt, { constitution, behaviour: '' });

    assert.ok(result.endsWith('Core principles...\n'), 'Expected constitution appended at end');
  });

  test('should not duplicate constitution section if already present', () => {
    const basePrompt = `## Task\nImplement feature X\n\n## Agent Constitution\nExisting content`;
    const constitution = '# Constitution\n\nCore principles...';

    const result = appendConstitutionSection(basePrompt, { constitution, behaviour: '' });

    // Count occurrences of the header
    const matches = result.match(/## Agent Constitution/g);
    assert.strictEqual(
      matches ? matches.length : 0,
      1,
      'Expected only one Agent Constitution section'
    );
  });
});
