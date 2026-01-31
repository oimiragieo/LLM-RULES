#!/usr/bin/env node
/**
 * Tests for documentation-routing-guard.cjs
 *
 * Verifies that documentation tasks are routed to technical-writer agent
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Import the module under test
const guard = require('../../.claude/hooks/routing/documentation-routing-guard.cjs');

describe('documentation-routing-guard', () => {
  describe('detectDocumentationIntent', () => {
    it('should detect high-confidence documentation intent', () => {
      const result = guard.detectDocumentationIntent('Write documentation for the API');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.includes('documentation'));
    });

    it('should detect high-confidence with readme', () => {
      const result = guard.detectDocumentationIntent('Update the README file');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.includes('readme'));
    });

    it('should detect high-confidence with user guide', () => {
      const result = guard.detectDocumentationIntent('Create a user guide for new features');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.includes('user guide'));
    });

    it('should detect high-confidence with api doc', () => {
      const result = guard.detectDocumentationIntent('Generate API doc for the endpoints');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'high');
      assert.ok(result.matchedKeywords.includes('api doc'));
    });

    it('should detect medium-confidence with multiple medium keywords', () => {
      const result = guard.detectDocumentationIntent('Create a guide and tutorial');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'medium');
    });

    it('should not detect doc intent for non-doc requests', () => {
      const result = guard.detectDocumentationIntent('Fix the login bug');
      assert.strictEqual(result.isDocTask, false);
      assert.strictEqual(result.confidence, 'low');
    });

    it('should be case-insensitive', () => {
      const result = guard.detectDocumentationIntent('Write DOCUMENTATION for the API');
      assert.strictEqual(result.isDocTask, true);
      assert.strictEqual(result.confidence, 'high');
    });
  });

  describe('isTechWriterSpawn', () => {
    it('should detect technical-writer in prompt', () => {
      const result = guard.isTechWriterSpawn({
        prompt: 'You are technical-writer. Create documentation.',
        description: 'Writer agent',
      });
      assert.strictEqual(result, true);
    });

    it('should detect technical-writer in description', () => {
      const result = guard.isTechWriterSpawn({
        prompt: 'Create documentation.',
        description: 'technical-writer creating docs',
      });
      assert.strictEqual(result, true);
    });

    it('should not detect other agents', () => {
      const result = guard.isTechWriterSpawn({
        prompt: 'You are developer. Fix the bug.',
        description: 'Developer agent',
      });
      assert.strictEqual(result, false);
    });
  });

  describe('validate', () => {
    let originalEnvVar;

    beforeEach(() => {
      originalEnvVar = process.env.DOCUMENTATION_ROUTING_GUARD;
    });

    it('should allow when enforcement is off', () => {
      process.env.DOCUMENTATION_ROUTING_GUARD = 'off';
      const result = guard.validate({
        prompt: 'Write documentation',
        description: 'Developer creating docs',
      });
      assert.strictEqual(result.valid, true);
      process.env.DOCUMENTATION_ROUTING_GUARD = originalEnvVar;
    });

    it('should allow non-documentation tasks', () => {
      process.env.DOCUMENTATION_ROUTING_GUARD = 'block';
      const result = guard.validate({
        prompt: 'Fix the login bug',
        description: 'Developer fixing bug',
      });
      assert.strictEqual(result.valid, true);
      process.env.DOCUMENTATION_ROUTING_GUARD = originalEnvVar;
    });

    it('should allow documentation tasks with technical-writer', () => {
      process.env.DOCUMENTATION_ROUTING_GUARD = 'block';
      const result = guard.validate({
        prompt: 'You are technical-writer. Write documentation for the API.',
        description: 'Technical writer creating docs',
      });
      assert.strictEqual(result.valid, true);
      process.env.DOCUMENTATION_ROUTING_GUARD = originalEnvVar;
    });

    it('should block documentation tasks without technical-writer in block mode', () => {
      process.env.DOCUMENTATION_ROUTING_GUARD = 'block';
      const result = guard.validate({
        prompt: 'You are developer. Write documentation for the API.',
        description: 'Developer creating docs',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('DOCUMENTATION ROUTING VIOLATION'));
      process.env.DOCUMENTATION_ROUTING_GUARD = originalEnvVar;
    });
  });

  describe('DOC_KEYWORDS constants', () => {
    it('should have high-confidence keywords defined', () => {
      assert.ok(Array.isArray(guard.DOC_KEYWORDS_HIGH));
      assert.ok(guard.DOC_KEYWORDS_HIGH.includes('documentation'));
      assert.ok(guard.DOC_KEYWORDS_HIGH.includes('readme'));
    });

    it('should have medium-confidence keywords defined', () => {
      assert.ok(Array.isArray(guard.DOC_KEYWORDS_MEDIUM));
      assert.ok(guard.DOC_KEYWORDS_MEDIUM.includes('document'));
      assert.ok(guard.DOC_KEYWORDS_MEDIUM.includes('docs'));
    });
  });

  describe('TECH_WRITER_PATTERNS constants', () => {
    it('should have prompt patterns defined', () => {
      assert.ok(Array.isArray(guard.TECH_WRITER_PATTERNS.prompt));
      assert.ok(guard.TECH_WRITER_PATTERNS.prompt.includes('you are technical-writer'));
    });

    it('should have description patterns defined', () => {
      assert.ok(Array.isArray(guard.TECH_WRITER_PATTERNS.description));
      assert.ok(guard.TECH_WRITER_PATTERNS.description.includes('technical-writer'));
    });
  });
});
