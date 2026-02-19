const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/hybrid-search.cjs');

function runCompress(query, extraArgs = []) {
  return spawnSync(process.execPath, [CLI_PATH, '--compress', query, ...extraArgs], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 60000,
    shell: false,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
}

describe('search:compress pipeline command', () => {
  test('--compress with query returns JSON with ok:true', () => {
    const result = runCompress('authentication');
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true, 'Expected ok to be true');
  });

  test('output includes search section with query and hits', () => {
    const result = runCompress('authentication');
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.search, 'Expected search section in output');
    assert.equal(parsed.search.query, 'authentication', 'Expected search.query to match input');
    assert.ok(typeof parsed.search.hits === 'number', 'Expected search.hits to be a number');
  });

  test('output includes compression section with adaptive ratio', () => {
    const result = runCompress('authentication');
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.compression, 'Expected compression section in output');
    assert.ok(
      typeof parsed.compression.skeletonRatio === 'number',
      'Expected compression.skeletonRatio to be a number'
    );
  });

  test('output includes memoryRecords with expected keys', () => {
    const result = runCompress('authentication');
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.memoryRecords, 'Expected memoryRecords in output');
    assert.ok('patterns' in parsed.memoryRecords, 'Expected patterns key in memoryRecords');
    assert.ok('gotchas' in parsed.memoryRecords, 'Expected gotchas key in memoryRecords');
    assert.ok('issues' in parsed.memoryRecords, 'Expected issues key in memoryRecords');
    assert.ok('decisions' in parsed.memoryRecords, 'Expected decisions key in memoryRecords');
  });

  test('output includes dedupStats', () => {
    const result = runCompress('authentication');
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.dedupStats, 'Expected dedupStats in output');
    assert.ok(parsed.dedupStats.total >= 0, 'Expected dedupStats.total >= 0');
  });

  test('--compress fails gracefully with empty query', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, '--compress'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 60000,
      shell: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    assert.equal(result.status, 1, 'Expected exit code 1 for empty query');
    const combined = (result.stderr || '') + (result.stdout || '');
    assert.ok(combined.length > 0, 'Expected error output for empty query');
  });
});
