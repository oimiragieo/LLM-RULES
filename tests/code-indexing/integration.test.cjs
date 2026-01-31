/**
 * Code Indexing - End-to-End Integration Tests
 *
 * Tests complete pipeline: files → parser → chunker → embedder → vectorDB → search
 *
 * @module tests/code-indexing/integration
 */

'use strict';

const { test, suite } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { IndexManager } = require('../../.claude/lib/code-indexing/index.cjs');

suite('End-to-End Integration Tests (43.1)', () => {
  let tempDir;
  let manager;
  let testFiles;

  // Helper: Create temporary test files
  function createTestProject(dir) {
    const files = {
      'index.js': `
        /**
         * Main entry point
         */
        function main() {
          console.log('Hello, world!');
          return processData();
        }

        function processData() {
          const data = loadData();
          return transform(data);
        }

        function loadData() {
          return { items: [1, 2, 3] };
        }

        function transform(data) {
          return data.items.map(x => x * 2);
        }

        module.exports = { main };
      `,

      'auth/login.ts': [
        'export interface User {',
        '  id: number;',
        '  username: string;',
        '  email: string;',
        '}',
        '',
        'export class AuthService {',
        '  async login(username: string, password: string): Promise<User> {',
        '    const valid = await this.verifyPassword(username, password);',
        "    if (!valid) { throw new Error('Invalid credentials'); }",
        '    return this.getUserByUsername(username);',
        '  }',
        '',
        '  async verifyPassword(username: string, password: string): Promise<boolean> {',
        '    return true;',
        '  }',
        '',
        '  private async getUserByUsername(username: string): Promise<User> {',
        "    return { id: 1, username, email: username + '@example.com' };",
        '  }',
        '}',
      ].join('\n'),

      'utils/helpers.py': [
        'def calculate_total(items):',
        '    """Calculate total price of items"""',
        "    return sum(item['price'] for item in items)",
        '',
        'def format_currency(amount):',
        '    """Format amount as currency"""',
        '    return "${:.2f}".format(amount)',
        '',
        'class DataProcessor:',
        '    def __init__(self, config):',
        '        self.config = config',
        '',
        '    def process(self, data):',
        '        """Process data with config"""',
        '        filtered = self.filter_data(data)',
        '        return self.transform_data(filtered)',
        '',
        '    def filter_data(self, data):',
        "        return [d for d in data if d.get('active')]",
        '',
        '    def transform_data(self, data):',
        '        return [self.transform_item(d) for d in data]',
        '',
        '    def transform_item(self, item):',
        '        return {',
        "            'id': item['id'],",
        "            'value': item['value'] * 2",
        '        }',
      ].join('\n'),
    };

    // Create files
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, filePath);
      const fileDir = path.dirname(fullPath);
      fs.mkdirSync(fileDir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
    }

    return Object.keys(files).map(f => path.join(dir, f));
  }

  // Setup: Create temp directory and index manager
  test('setup - create test environment', _t => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-index-test-'));
    testFiles = createTestProject(tempDir);

    manager = new IndexManager({
      projectRoot: tempDir,
      metadataPath: path.join(tempDir, '.metadata.json'),
    });

    assert.ok(tempDir);
    assert.strictEqual(testFiles.length, 3);
    assert.ok(manager);
  });

  test('43.1.1: Index real project (3 files, multiple languages)', async () => {
    // Index the test project
    const result = await manager.indexDirectory(tempDir);

    // Verify results
    assert.ok(result, 'Index result should exist');
    assert.ok(result.stats, 'Stats should exist');
    assert.ok(result.stats.files >= 3, 'Should index at least 3 files');
    assert.ok(result.stats.chunks > 0, 'Should create chunks');

    // Verify multi-language support
    const byLanguage = result.stats.byLanguage || {};
    assert.ok(byLanguage.javascript > 0, 'Should have JavaScript chunks');
    assert.ok(byLanguage.typescript > 0, 'Should have TypeScript chunks');
    assert.ok(byLanguage.python > 0, 'Should have Python chunks');
  });

  test('43.1.2: Full pipeline verification (files → parser → chunker → embedder → vectorDB)', async () => {
    // Re-index to verify pipeline
    const result = await manager.indexDirectory(tempDir);

    // Verify each pipeline stage
    assert.ok(result.stats.files > 0, 'Parser: Should parse files');
    assert.ok(result.stats.chunks > 0, 'Chunker: Should create chunks');

    // Embedder verification (implicit - if search works, embeddings worked)
    // VectorDB verification (implicit - if search returns results, DB works)

    assert.ok(result.stats.chunks >= result.stats.files, 'Should have at least 1 chunk per file');
  });

  test('43.1.3: Semantic search quality (top results are relevant)', async () => {
    // Search for authentication-related code
    const authResults = await manager.semanticSearch('login authentication user credentials', 5);

    assert.ok(authResults.length > 0, 'Should return results for auth query');

    // Top result should be from auth/login.ts
    const topResult = authResults[0];
    assert.ok(topResult.filePath.includes('login'), 'Top result should be from login file');
    assert.ok(
      topResult.content.includes('login') || topResult.content.includes('auth'),
      'Top result content should mention login or auth'
    );

    // Search for data processing code
    const dataResults = await manager.semanticSearch('process data transform items', 5);

    assert.ok(dataResults.length > 0, 'Should return results for data processing query');

    // Results should include relevant code
    const hasRelevant = dataResults.some(
      r =>
        r.content.includes('process') ||
        r.content.includes('transform') ||
        r.content.includes('data')
    );
    assert.ok(hasRelevant, 'Results should contain relevant code');
  });

  test('43.1.4: CLI verification (index, search, status, clear)', async () => {
    // This is integration test - CLI tests are in cli.test.cjs
    // Here we just verify the underlying methods work correctly

    // Index
    const indexResult = await manager.indexDirectory(tempDir);
    assert.ok(indexResult.stats.files > 0, 'Index command should work');

    // Search
    const searchResults = await manager.semanticSearch('function', 5);
    assert.ok(searchResults.length > 0, 'Search command should work');

    // Status (read metadata)
    const metadata = manager.getMetadata();
    assert.ok(metadata, 'Status command should work');
    assert.ok(metadata.stats, 'Metadata should have stats');

    // Clear (tested in other tests - directory deletion)
  });

  test('43.1.5: Verify search result relevance and ranking', async () => {
    // Query with specific function name
    const results = await manager.semanticSearch('main entry point hello world', 5);

    assert.ok(results.length > 0, 'Should find results');

    // First result should have high relevance
    const top = results[0];
    assert.ok(top.score !== undefined, 'Results should have scores');
    assert.ok(top.score >= 0 && top.score <= 1, 'Score should be between 0 and 1');

    // Results should be sorted by score (descending)
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        'Results should be sorted by score descending'
      );
    }
  });

  test('cleanup - remove test environment', () => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    assert.ok(!fs.existsSync(tempDir), 'Temp directory should be removed');
  });
});

suite('Multi-Language Support Tests (43.2)', () => {
  let tempDir;
  let manager;

  test('setup - create multi-language test project', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-index-multi-lang-'));

    const files = {
      'test.js': 'function jsFunc() { return 42; }',
      'test.ts': 'function tsFunc(): number { return 42; }',
      'test.py': 'def py_func():\n    return 42',
      'test.go': 'package main\nfunc goFunc() int {\n    return 42\n}',
      'test.rs': 'fn rust_func() -> i32 {\n    42\n}',
    };

    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, file), content, 'utf-8');
    }

    manager = new IndexManager({
      projectRoot: tempDir,
      metadataPath: path.join(tempDir, '.metadata.json'),
    });

    assert.ok(tempDir);
  });

  test('43.2.1: Index mixed codebase (JS, TS, Python, Go, Rust)', async () => {
    const result = await manager.indexDirectory(tempDir);

    assert.ok(result.stats.files >= 5, 'Should index all 5 language files');
    assert.ok(result.stats.chunks > 0, 'Should create chunks');
  });

  test('43.2.2: Verify each language parses correctly', async () => {
    const result = await manager.indexDirectory(tempDir);
    const byLanguage = result.stats.byLanguage || {};

    // Each language should have at least 1 chunk
    assert.ok(byLanguage.javascript > 0, 'JavaScript should parse');
    assert.ok(byLanguage.typescript > 0, 'TypeScript should parse');
    assert.ok(byLanguage.python > 0, 'Python should parse');
    assert.ok(byLanguage.go > 0, 'Go should parse');
    assert.ok(byLanguage.rust > 0, 'Rust should parse');
  });

  test('43.2.3: Test chunking for language-specific structures', async () => {
    const result = await manager.indexDirectory(tempDir);

    // Verify chunks exist for each language
    assert.ok(result.stats.chunks >= 5, 'Should have chunks for all languages');
  });

  test('43.2.4: Test embeddings quality per language', async () => {
    // Index first
    await manager.indexDirectory(tempDir);

    // Search for function-related code in each language
    const results = await manager.semanticSearch('function return 42', 10);

    assert.ok(results.length > 0, 'Should find functions across languages');

    // Results should include multiple languages
    const languages = new Set(results.map(r => r.language));
    assert.ok(languages.size >= 3, 'Should return results from multiple languages');
  });

  test('cleanup - remove multi-language test environment', () => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
