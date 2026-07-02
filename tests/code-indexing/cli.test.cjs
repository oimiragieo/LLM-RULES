/**
 * Tests for CLI tool (index-codebase.cjs)
 *
 * @group cli
 */

const { test, suite, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const CLI_PATH = path.join(__dirname, '../../.claude/tools/cli/index-codebase.cjs');
const TEST_PROJECT = path.join(__dirname, 'fixtures/test-project');
const INDEX_DIR = path.join(TEST_PROJECT, '.claude/context/code-index');

function runCli(args, options = {}) {
  return execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8', ...options });
}

suite('CLI - index-codebase', () => {
  before(async () => {
    // Create test project structure
    await fs.mkdir(path.join(TEST_PROJECT, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(TEST_PROJECT, 'src/example.js'),
      'function hello() {\n  return "world";\n}'
    );
  });

  after(async () => {
    // Cleanup
    await fs.rm(TEST_PROJECT, { recursive: true, force: true });
  });

  test('42.1: --help shows usage', () => {
    const output = runCli(['--help']);
    assert.ok(output.includes('Usage:'), 'Help should show usage');
    assert.ok(output.includes('index'), 'Help should mention index command');
    assert.ok(output.includes('search'), 'Help should mention search command');
    assert.ok(output.includes('status'), 'Help should mention status command');
    assert.ok(output.includes('clear'), 'Help should mention clear command');
  });

  test('42.2: index command creates metadata', async () => {
    runCli(['index', TEST_PROJECT]);

    // Check metadata file exists
    const metadataPath = path.join(INDEX_DIR, 'metadata.json');
    const exists = await fs
      .access(metadataPath)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, 'Metadata file should be created');

    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    assert.ok(metadata.files, 'Metadata should contain files');
    assert.ok(metadata.stats, 'Metadata should contain stats');
  });

  test('42.3: search command displays results', () => {
    const output = runCli(['search', 'hello', '--topK', '5'], {
      cwd: TEST_PROJECT,
    });
    assert.ok(output.includes('Found'), 'Output should show persisted sparse search results');
    assert.ok(output.includes('src/example.js'), 'Search should find the indexed fixture file');
  });

  test('42.4: status command shows statistics', async () => {
    const output = runCli(['status'], { cwd: TEST_PROJECT });
    assert.ok(output.includes('Index Status:'), 'Output should show status header');
    assert.ok(output.includes('Files:'), 'Output should show file count');
    assert.ok(output.includes('Chunks:'), 'Output should show chunk count');
  });

  test('42.5: clear command removes index', async () => {
    runCli(['clear', '--confirm'], { cwd: TEST_PROJECT });

    const metadataPath = path.join(INDEX_DIR, 'metadata.json');
    const exists = await fs
      .access(metadataPath)
      .then(() => true)
      .catch(() => false);
    assert.ok(!exists, 'Metadata file should be deleted');
  });
});
