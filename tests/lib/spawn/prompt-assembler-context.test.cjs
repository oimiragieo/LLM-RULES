#!/usr/bin/env node
/**
 * Prompt Assembler Context - Unit Tests
 * ======================================
 *
 * Tests for the prompt-assembler-context.cjs utility that loads and injects
 * project-context.md content into agent spawn prompts.
 *
 * Slice 4: Project Context File auto-injection
 *
 * Test categories:
 * 1. Load project-context.md when it exists
 * 2. Return empty string when file missing
 * 3. Truncate content to configurable char limit
 * 4. Respect PROJECT_CONTEXT_INJECTION=off env var
 * 5. Use default 2048 char limit when env not set
 * 6. Strip frontmatter before injection
 * 7. Handle empty project-context.md gracefully
 *
 * @module prompt-assembler-context.test
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Absolute path to the module under test
const MODULE_PATH = path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler-context.cjs');

/**
 * Helper: create a temp directory with an optional project-context.md file
 * Returns { dir, contextFilePath, cleanup }
 */
function createTempProject(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-test-'));
  const contextDir = path.join(dir, '.claude', 'context');
  fs.mkdirSync(contextDir, { recursive: true });
  const contextFilePath = path.join(contextDir, 'project-context.md');
  if (content !== undefined) {
    fs.writeFileSync(contextFilePath, content, 'utf-8');
  }
  return {
    dir,
    contextFilePath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

describe('prompt-assembler-context', () => {
  let loadProjectContext;
  let savedEnv;

  beforeEach(() => {
    // Clear require cache so env var changes take effect
    delete require.cache[MODULE_PATH];
    // Save environment
    savedEnv = {
      PROJECT_CONTEXT_INJECTION: process.env.PROJECT_CONTEXT_INJECTION,
      PROJECT_CONTEXT_CHAR_LIMIT: process.env.PROJECT_CONTEXT_CHAR_LIMIT,
    };
    // Reset env vars to defaults
    delete process.env.PROJECT_CONTEXT_INJECTION;
    delete process.env.PROJECT_CONTEXT_CHAR_LIMIT;
    // Load fresh module
    loadProjectContext = require(MODULE_PATH).loadProjectContext;
  });

  afterEach(() => {
    // Restore environment
    if (savedEnv.PROJECT_CONTEXT_INJECTION === undefined) {
      delete process.env.PROJECT_CONTEXT_INJECTION;
    } else {
      process.env.PROJECT_CONTEXT_INJECTION = savedEnv.PROJECT_CONTEXT_INJECTION;
    }
    if (savedEnv.PROJECT_CONTEXT_CHAR_LIMIT === undefined) {
      delete process.env.PROJECT_CONTEXT_CHAR_LIMIT;
    } else {
      process.env.PROJECT_CONTEXT_CHAR_LIMIT = savedEnv.PROJECT_CONTEXT_CHAR_LIMIT;
    }
    delete require.cache[MODULE_PATH];
  });

  it('should load project-context.md when it exists', () => {
    const { dir, cleanup } = createTempProject(
      '# Project Context\n\nThis is a test project context.'
    );
    try {
      const result = loadProjectContext({ projectRoot: dir });
      assert.ok(
        result.includes('This is a test project context.'),
        'Result should include file content'
      );
      assert.ok(result.includes('## Project Context'), 'Result should include section header');
    } finally {
      cleanup();
    }
  });

  it('should return empty string when project-context.md is missing', () => {
    const { dir, cleanup } = createTempProject(); // no file created
    try {
      const result = loadProjectContext({ projectRoot: dir });
      assert.strictEqual(result, '', 'Result should be empty string when file missing');
    } finally {
      cleanup();
    }
  });

  it('should truncate content to configurable char limit', () => {
    // Create 5KB content (well over the 2048 default limit)
    const largeContent = 'x'.repeat(5 * 1024);
    const { dir, cleanup } = createTempProject(largeContent);
    try {
      const limit = 2048;
      const result = loadProjectContext({ projectRoot: dir, charLimit: limit });
      // Result should be no longer than limit + overhead of header + truncation marker
      // The raw content portion should be at most `limit` chars
      assert.ok(
        result.includes('[truncated]'),
        'Result should include [truncated] marker when content exceeds limit'
      );
      // The overall result should not wildly exceed the limit (header + limit + marker)
      assert.ok(
        result.length <= limit + 200,
        `Result length (${result.length}) should not exceed limit + header overhead`
      );
    } finally {
      cleanup();
    }
  });

  it('should respect PROJECT_CONTEXT_INJECTION=off env var', () => {
    const { dir, cleanup } = createTempProject('Some content that should not appear');
    try {
      process.env.PROJECT_CONTEXT_INJECTION = 'off';
      const result = loadProjectContext({ projectRoot: dir });
      assert.strictEqual(
        result,
        '',
        'Result should be empty string when PROJECT_CONTEXT_INJECTION=off'
      );
    } finally {
      cleanup();
    }
  });

  it('should use default 2048 char limit when PROJECT_CONTEXT_CHAR_LIMIT env not set', () => {
    // Content just over 2048 chars
    const content = 'y'.repeat(3000);
    const { dir, cleanup } = createTempProject(content);
    try {
      delete process.env.PROJECT_CONTEXT_CHAR_LIMIT;
      const result = loadProjectContext({ projectRoot: dir });
      assert.ok(result.includes('[truncated]'), 'Result should be truncated at default 2048 chars');
      // Verify the raw content portion is at most 2048 chars
      // Strip the header to find actual content length
      const withoutHeader = result.replace(/^## Project Context\n\n/, '');
      assert.ok(
        withoutHeader.length <= 2048 + 20, // +20 for "[truncated]" marker
        `Content should be limited to ~2048 chars, got ${withoutHeader.length}`
      );
    } finally {
      cleanup();
    }
  });

  it('should strip YAML frontmatter before injection', () => {
    const contentWithFrontmatter =
      '---\ntitle: My Project\nversion: 1.0.0\ntags: [agent, framework]\n---\n\n# Real Content\n\nThis is the actual content.';
    const { dir, cleanup } = createTempProject(contentWithFrontmatter);
    try {
      const result = loadProjectContext({ projectRoot: dir });
      assert.ok(!result.includes('title: My Project'), 'Result should not contain frontmatter key');
      assert.ok(!result.includes('version: 1.0.0'), 'Result should not contain frontmatter value');
      assert.ok(!result.includes('---'), 'Result should not contain frontmatter delimiters');
      assert.ok(result.includes('Real Content'), 'Result should contain content after frontmatter');
      assert.ok(
        result.includes('This is the actual content.'),
        'Result should contain body content'
      );
    } finally {
      cleanup();
    }
  });

  it('should handle empty project-context.md gracefully', () => {
    const { dir, cleanup } = createTempProject(''); // empty file
    try {
      let result;
      assert.doesNotThrow(() => {
        result = loadProjectContext({ projectRoot: dir });
      }, 'Should not throw on empty file');
      assert.strictEqual(typeof result, 'string', 'Result should be a string');
      // Empty content after stripping whitespace should yield empty result
      assert.strictEqual(result, '', 'Result should be empty string for empty file content');
    } finally {
      cleanup();
    }
  });
});
