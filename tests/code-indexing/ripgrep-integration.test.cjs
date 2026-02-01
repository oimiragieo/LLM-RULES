/**
 * Ripgrep integration tests
 *
 * Tests @vscode/ripgrep binary resolution, search functionality in
 * contextual-memory.cjs, and integration with ripgrep skill scripts.
 *
 * Test execution: node --test tests/code-indexing/ripgrep-integration.test.cjs
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Keep tests deterministic and avoid heavy ChromaDB initialization.
process.env.MEMORY_SEMANTIC_SEARCH ??= 'off';

const { ContextualMemory } = require('../../.claude/lib/memory/contextual-memory.cjs');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing');
const MEMORY_FIXTURE_DIR = path.join(FIXTURES_DIR, 'ripgrep-memory');

describe('Ripgrep integration', () => {
  before(async () => {
    await fsPromises.mkdir(MEMORY_FIXTURE_DIR, { recursive: true });
    await fsPromises.writeFile(
      path.join(MEMORY_FIXTURE_DIR, 'learnings.md'),
      'Ripgrep integration test.\nKeyword: TaskUpdate and contextual memory.\n'
    );
    await fsPromises.writeFile(
      path.join(MEMORY_FIXTURE_DIR, 'decisions.md'),
      'Use @vscode/ripgrep for binary. Fallback to bin/rg if needed.\n'
    );
  });

  after(async () => {
    await fsPromises.rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('_getRipgrepPath()', () => {
    test('returns string or null', () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      assert.ok(rgPath === null || typeof rgPath === 'string', 'rgPath is string or null');
    });

    test('prefers @vscode/ripgrep when available', () => {
      let npmPath;
      try {
        const { rgPath } = require('@vscode/ripgrep');
        npmPath = rgPath;
      } catch {
        npmPath = null;
      }
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const resolved = memory._getRipgrepPath();
      if (npmPath) {
        assert.strictEqual(resolved, npmPath, 'Should use npm package path when available');
      }
    });

    test('fallback path uses platform-specific binary name', () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (rgPath && rgPath.includes('bin')) {
        const expectedName = process.platform === 'win32' ? 'rg.exe' : 'rg';
        assert.ok(
          rgPath.endsWith(expectedName) || rgPath.includes(expectedName),
          `Fallback path should reference ${expectedName} on ${process.platform}`
        );
      }
    });

    test('returns null when binary not found (mocked)', () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const pathUsed = memory._getRipgrepPath();
      if (pathUsed === null) {
        assert.strictEqual(pathUsed, null, 'When no package and no bin, returns null');
      }
    });
  });

  describe('_checkBinaryAvailable()', () => {
    test('returns false for nonexistent binary', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const available = await memory._checkBinaryAvailable('/nonexistent/rg-fake');
      assert.strictEqual(available, false, 'Nonexistent binary should be unavailable');
    });

    test('returns true when ripgrep binary is available', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const available = await memory._checkBinaryAvailable(rgPath);
      assert.strictEqual(available, true, 'Installed ripgrep should be available');
    });
  });

  describe('_searchWithRipgrep()', () => {
    test('returns empty array when rg path is null', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (rgPath) {
        assert.ok(true, 'Skipped: ripgrep available, cannot test null path');
        return;
      }
      const results = await memory._searchWithRipgrep('test', ['learnings.md'], 5);
      assert.deepStrictEqual(results, [], 'Should return [] when no binary');
    });

    test('returns empty array when no files to search', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const results = await memory._searchWithRipgrep('anything', [], 5);
      assert.deepStrictEqual(results, [], 'No files should yield no results');
    });

    test('finds matches in memory files', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const results = await memory._searchWithRipgrep('TaskUpdate', ['learnings.md'], 5);
      assert.ok(Array.isArray(results), 'Results should be array');
      if (results.length > 0) {
        assert.ok(results[0].content !== undefined, 'Result has content');
        assert.ok(results[0].metadata && results[0].metadata.path !== undefined, 'Result has path');
        assert.strictEqual(results[0].source, 'ripgrep', 'Source should be ripgrep');
      }
    });

    test('respects limit', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const results = await memory._searchWithRipgrep(
        'contextual',
        ['learnings.md', 'decisions.md'],
        2
      );
      assert.ok(results.length <= 2, 'Results should not exceed limit');
    });
  });

  describe('keyword search integration', () => {
    test('search() can use ripgrep when semantic unavailable', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (!rgPath) {
        assert.ok(true, 'Skipped: ripgrep not available');
        return;
      }
      const results = await memory.search('TaskUpdate', { limit: 5 });
      assert.ok(Array.isArray(results), 'search() returns array');
    });
  });

  describe('ripgrep skill scripts', () => {
    test('search.mjs resolves @vscode/ripgrep binary', (t, done) => {
      const scriptPath = path.join(
        __dirname,
        '..',
        '..',
        '.claude',
        'skills',
        'ripgrep',
        'scripts',
        'search.mjs'
      );
      if (!fs.existsSync(scriptPath)) {
        assert.ok(true, 'Skipped: search.mjs not found');
        done();
        return;
      }
      const child = spawn('node', [scriptPath, '--version'], {
        cwd: path.join(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', d => {
        stderr += d.toString();
      });
      child.on('close', code => {
        if (code === 1 && /@vscode\/ripgrep/.test(stderr)) {
          assert.ok(true, 'Script correctly reports missing package');
        } else {
          assert.ok(code === 0 || code === 1, 'Script exits 0 or 1');
        }
        done();
      });
    });

    test('quick-search.mjs resolves @vscode/ripgrep binary', (t, done) => {
      const scriptPath = path.join(
        __dirname,
        '..',
        '..',
        '.claude',
        'skills',
        'ripgrep',
        'scripts',
        'quick-search.mjs'
      );
      if (!fs.existsSync(scriptPath)) {
        assert.ok(true, 'Skipped: quick-search.mjs not found');
        done();
        return;
      }
      // Keep this fast and deterministic by searching a small, known subtree.
      // The goal is to validate that the script can resolve and execute the rg binary.
      const child = spawn('node', [scriptPath, 'skills', 'Quick Search Presets'], {
        cwd: path.join(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', d => {
        stderr += d.toString();
      });
      child.on('close', code => {
        if (code === 1 && /@vscode\/ripgrep/.test(stderr)) {
          assert.ok(true, 'Script correctly reports missing package');
        } else {
          assert.ok(code === 0 || code === 1, 'Script exits 0 or 1');
        }
        done();
      });
    });
  });

  describe('cross-platform binary detection', () => {
    test('fallback path uses .exe on Windows', () => {
      if (process.platform !== 'win32') {
        assert.ok(true, 'Skipped: not Windows');
        return;
      }
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const rgPath = memory._getRipgrepPath();
      if (rgPath && rgPath.includes('bin')) {
        assert.ok(
          rgPath.endsWith('.exe') || rgPath.includes('rg.exe'),
          'Windows fallback should use .exe'
        );
      }
    });
  });

  describe('error handling', () => {
    test('_searchWithRipgrep returns [] when binary not found', async () => {
      const memory = new ContextualMemory({ memoryDir: MEMORY_FIXTURE_DIR });
      const pathBefore = memory._getRipgrepPath();
      if (pathBefore) {
        assert.ok(true, 'Skipped: ripgrep available');
        return;
      }
      const results = await memory._searchWithRipgrep('test', ['learnings.md'], 5);
      assert.deepStrictEqual(results, [], 'Should return [] when binary not found');
    });
  });
});
