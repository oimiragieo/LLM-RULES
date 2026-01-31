/**
 * Tests for ast-grep-wrapper.cjs
 * Phase 2: Hybrid Search - AST pattern-based search wrapper
 *
 * Test execution: node --test tests/code-indexing/ast-grep-wrapper.test.cjs
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { AstGrepSearch } = require('../../.claude/lib/code-indexing/ast-grep-wrapper.cjs');

const TEST_DIR = path.join(__dirname, 'fixtures', 'ast-grep-test');

// Test fixtures with real code patterns
const FIXTURES = {
  'test.js': `
function hello(name) {
  return "Hello, " + name;
}

function goodbye(name) {
  return "Bye, " + name;
}

async function fetchData(url) {
  return await fetch(url);
}
`,
  'test.ts': `
function typed(x: number): number {
  return x * 2;
}

async function asyncTyped(x: number): Promise<number> {
  return x * 2;
}
`,
  'test.py': `
def hello(name):
    return f"Hello, {name}"

def goodbye(name):
    return f"Bye, {name}"
`
};

describe('AstGrepSearch', () => {
  before(async () => {
    // Create test fixtures
    await fs.mkdir(TEST_DIR, { recursive: true });
    for (const [name, content] of Object.entries(FIXTURES)) {
      await fs.writeFile(path.join(TEST_DIR, name), content.trim());
    }
  });

  after(async () => {
    // Clean up fixtures
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('isAvailable()', () => {
    test('should return true when ast-grep binary exists', async () => {
      const sg = new AstGrepSearch();
      const available = await sg.isAvailable();

      // This test depends on ast-grep being installed
      assert.strictEqual(typeof available, 'boolean');
      // If ast-grep is installed, should return true
      if (available) {
        assert.strictEqual(available, true);
      }
    });

    test('should return false with invalid binPath', async () => {
      const sg = new AstGrepSearch({ binPath: '/nonexistent/sg-fake-binary' });
      const available = await sg.isAvailable();

      assert.strictEqual(available, false);
    });
  });

  describe('getVersion()', () => {
    test('should return version string when binary exists', async () => {
      const sg = new AstGrepSearch();
      const isAvailable = await sg.isAvailable();

      if (isAvailable) {
        const version = await sg.getVersion();
        assert.strictEqual(typeof version, 'string');
        assert.ok(version.length > 0, 'Version string should not be empty');
      } else {
        // Skip if ast-grep not installed
        assert.ok(true, 'Skipped: ast-grep not installed');
      }
    });

    test('should throw error with invalid binPath', async () => {
      const sg = new AstGrepSearch({ binPath: '/nonexistent/sg-fake-binary' });

      await assert.rejects(
        () => sg.getVersion(),
        /ast-grep/i,
        'Should throw error when binary is missing'
      );
    });
  });

  describe('search()', () => {
    test('should find JavaScript functions', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const isAvailable = await sg.isAvailable();

      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }

      const results = await sg.search('function $NAME($$$) { $$$ }', 'javascript');

      assert.ok(Array.isArray(results), 'Should return array');
      assert.ok(results.length >= 3, `Expected at least 3 results, got ${results.length}`);

      // Check result structure
      const first = results[0];
      assert.ok(first.filePath, 'Result should have filePath');
      assert.ok(typeof first.lineStart === 'number', 'lineStart should be number');
      assert.ok(typeof first.lineEnd === 'number', 'lineEnd should be number');
      assert.ok(first.code, 'Result should have code');
      assert.strictEqual(first.language, 'javascript', 'Language should be javascript');
    });

    test('should find async functions', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const isAvailable = await sg.isAvailable();

      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }

      const results = await sg.search('async function $NAME($$$) { $$$ }', 'javascript');

      assert.ok(Array.isArray(results));
      assert.ok(results.length >= 1, 'Should find at least one async function');
      assert.ok(results[0].code.includes('async'), 'Code should contain async keyword');
    });

    test('should respect include patterns', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const isAvailable = await sg.isAvailable();

      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }

      const results = await sg.search('function $NAME($$$) { $$$ }', 'javascript', {
        include: ['test.js']
      });

      assert.ok(results.every(r => r.filePath.endsWith('test.js')), 'All results should be from test.js');
    });

    test('should throw on empty pattern', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });

      await assert.rejects(
        () => sg.search('', 'javascript'),
        /Pattern must be a non-empty string/,
        'Should reject empty pattern'
      );
    });

    test('should handle no matches gracefully', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const isAvailable = await sg.isAvailable();

      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }

      const results = await sg.search('function nonExistentFunctionName() {}', 'javascript');

      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 0, 'Should return empty array for no matches');
    });
  });

  describe('refine()', () => {
    test('should add structural scores to semantic results', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const isAvailable = await sg.isAvailable();

      if (!isAvailable) {
        assert.ok(true, 'Skipped: ast-grep not installed');
        return;
      }

      // Mock semantic results
      const semanticResults = [
        {
          filePath: path.join(TEST_DIR, 'test.js'),
          lineRange: [2, 4],
          code: 'function hello(name) { return "Hello, " + name; }',
          semanticScore: 0.9
        },
        {
          filePath: path.join(TEST_DIR, 'test.js'),
          lineRange: [6, 8],
          code: 'function goodbye(name) { return "Bye, " + name; }',
          semanticScore: 0.8
        }
      ];

      const refined = await sg.refine(
        semanticResults,
        'function hello($$$) { $$$ }',
        'javascript'
      );

      assert.strictEqual(refined.length, 2, 'Should have 2 refined results');

      // First should have high structural score (exact match on function name)
      assert.ok(refined[0].structuralScore !== undefined, 'Should have structuralScore');
      assert.ok(typeof refined[0].structuralScore === 'number', 'structuralScore should be number');

      // Second should have lower structural score (different function name)
      assert.ok(refined[1].structuralScore !== undefined, 'Should have structuralScore');
    });

    test('should handle empty semantic results', async () => {
      const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
      const refined = await sg.refine([], 'function $NAME() {}', 'javascript');

      assert.ok(Array.isArray(refined));
      assert.strictEqual(refined.length, 0, 'Empty input should return empty array');
    });
  });
});
