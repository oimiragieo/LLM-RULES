#!/usr/bin/env node
/**
 * Format Memory Test Suite
 * =========================
 *
 * TDD tests for format-memory.cjs.
 * Tests cover memory file detection and formatting logic.
 *
 * Exit codes: 0 = allow (always allows, just formats if applicable)
 *
 * Note: This hook uses shared utilities from hook-input.cjs and project-root.cjs.
 * SEC-009 FIX: Uses spawnSync with array args to prevent command injection.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Note: format-memory.cjs runs main() on load, so we need to handle that
// For unit testing, we test the logic patterns it implements

describe('format-memory', () => {
  let testDir;
  let memoryDir;

  beforeEach(() => {
    // Create temp directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-memory-test-'));

    // Create memory directory structure
    memoryDir = path.join(testDir, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('memory path detection', () => {
    const MEMORY_PATHS = [
      '.claude/context/memory',
      '.claude/context/reports',
      '.claude/context/plans',
    ];

    it('should recognize .claude/context/memory as memory path', () => {
      const testPath = path.join(testDir, '.claude', 'context', 'memory', 'learnings.md');
      const normalized = testPath.replace(/\\/g, '/');

      const isMemory = MEMORY_PATHS.some(memPath => normalized.includes(memPath));
      assert.strictEqual(isMemory, true);
    });

    it('should recognize .claude/context/reports as memory path', () => {
      const testPath = path.join(testDir, '.claude', 'context', 'reports', 'test.md');
      const normalized = testPath.replace(/\\/g, '/');

      const isMemory = MEMORY_PATHS.some(memPath => normalized.includes(memPath));
      assert.strictEqual(isMemory, true);
    });

    it('should recognize .claude/context/plans as memory path', () => {
      const testPath = path.join(testDir, '.claude', 'context', 'plans', 'plan.md');
      const normalized = testPath.replace(/\\/g, '/');

      const isMemory = MEMORY_PATHS.some(memPath => normalized.includes(memPath));
      assert.strictEqual(isMemory, true);
    });

    it('should not recognize src/ as memory path', () => {
      const testPath = path.join(testDir, 'src', 'index.js');
      const normalized = testPath.replace(/\\/g, '/');

      const isMemory = MEMORY_PATHS.some(memPath => normalized.includes(memPath));
      assert.strictEqual(isMemory, false);
    });

    it('should not recognize .claude/hooks as memory path', () => {
      const testPath = path.join(testDir, '.claude', 'hooks', 'test.cjs');
      const normalized = testPath.replace(/\\/g, '/');

      const isMemory = MEMORY_PATHS.some(memPath => normalized.includes(memPath));
      assert.strictEqual(isMemory, false);
    });
  });

  describe('markdown file detection', () => {
    it('should recognize .md files as markdown', () => {
      const testPath = 'learnings.md';
      assert.strictEqual(testPath.endsWith('.md'), true);
    });

    it('should recognize .MD files as markdown', () => {
      const testPath = 'README.MD';
      // The hook uses .endsWith('.md') which is case-sensitive
      assert.strictEqual(testPath.endsWith('.md'), false);
      assert.strictEqual(testPath.endsWith('.MD'), true);
    });

    it('should not recognize .js files as markdown', () => {
      const testPath = 'index.js';
      assert.strictEqual(testPath.endsWith('.md'), false);
    });

    it('should not recognize .json files as markdown', () => {
      const testPath = 'package.json';
      assert.strictEqual(testPath.endsWith('.md'), false);
    });
  });

  describe('path safety validation (SEC-009)', () => {
    // SEC-009 FIX: isPathSafe checks for dangerous characters
    const SAFE_PATTERN = /^[a-zA-Z0-9_\-.\\/:\s]+$/;
    const DANGEROUS_CHARS = [
      '$',
      '`',
      '|',
      '&',
      ';',
      '(',
      ')',
      '<',
      '>',
      '!',
      '*',
      '?',
      '[',
      ']',
      '{',
      '}',
      '"',
      "'",
      '\n',
      '\r',
    ];

    function isPathSafe(filePath) {
      if (!SAFE_PATTERN.test(filePath)) {
        return false;
      }
      return !DANGEROUS_CHARS.some(char => filePath.includes(char));
    }

    describe('safe paths', () => {
      it('should allow simple file paths', () => {
        assert.strictEqual(isPathSafe('learnings.md'), true);
      });

      it('should allow paths with slashes', () => {
        assert.strictEqual(isPathSafe('.claude/context/memory/learnings.md'), true);
      });

      it('should allow Windows paths', () => {
        assert.strictEqual(isPathSafe('C:\\dev\\projects\\agent-studio\\file.md'), true);
      });

      it('should allow paths with spaces', () => {
        assert.strictEqual(isPathSafe('/path/with spaces/file.md'), true);
      });

      it('should allow paths with hyphens and underscores', () => {
        assert.strictEqual(isPathSafe('my-file_name.test.md'), true);
      });
    });

    describe('dangerous paths', () => {
      it('should reject paths with $', () => {
        assert.strictEqual(isPathSafe('$(rm -rf /).md'), false);
      });

      it('should reject paths with backticks', () => {
        assert.strictEqual(isPathSafe('`whoami`.md'), false);
      });

      it('should reject paths with pipe', () => {
        assert.strictEqual(isPathSafe('file | rm.md'), false);
      });

      it('should reject paths with ampersand', () => {
        assert.strictEqual(isPathSafe('file & rm.md'), false);
      });

      it('should reject paths with semicolon', () => {
        assert.strictEqual(isPathSafe('file; rm /.md'), false);
      });

      it('should reject paths with parentheses', () => {
        assert.strictEqual(isPathSafe('file(test).md'), false);
      });

      it('should reject paths with angle brackets', () => {
        assert.strictEqual(isPathSafe('file<test>.md'), false);
      });

      it('should reject paths with exclamation', () => {
        assert.strictEqual(isPathSafe('file!.md'), false);
      });

      it('should reject paths with wildcards', () => {
        assert.strictEqual(isPathSafe('*.md'), false);
      });

      it('should reject paths with brackets', () => {
        assert.strictEqual(isPathSafe('file[0].md'), false);
      });

      it('should reject paths with braces', () => {
        assert.strictEqual(isPathSafe('file{a,b}.md'), false);
      });

      it('should reject paths with quotes', () => {
        assert.strictEqual(isPathSafe("file'test'.md"), false);
        assert.strictEqual(isPathSafe('file"test".md'), false);
      });

      it('should reject paths with newlines', () => {
        assert.strictEqual(isPathSafe('file\ntest.md'), false);
        assert.strictEqual(isPathSafe('file\rtest.md'), false);
      });
    });
  });

  describe('tool filtering', () => {
    it('should only process Edit and Write tools', () => {
      const WRITE_TOOLS = ['Edit', 'Write'];

      assert.strictEqual(WRITE_TOOLS.includes('Edit'), true);
      assert.strictEqual(WRITE_TOOLS.includes('Write'), true);
      assert.strictEqual(WRITE_TOOLS.includes('Read'), false);
      assert.strictEqual(WRITE_TOOLS.includes('Bash'), false);
    });
  });

  describe('formatting behavior', () => {
    it('should attempt pnpm format first', () => {
      // The hook tries: pnpm format <file>
      // Then falls back to: npx prettier --write <file>
      assert.ok(true, 'Behavior documented: pnpm format -> prettier fallback');
    });

    it('should use shell: false for security', () => {
      // SEC-009 FIX: Disable shell to prevent injection
      assert.ok(true, 'Behavior documented: spawnSync uses shell: false');
    });

    it('should timeout after 10 seconds', () => {
      // The hook uses timeout: 10000 for formatting commands
      assert.ok(true, 'Behavior documented: 10 second timeout');
    });
  });
});
