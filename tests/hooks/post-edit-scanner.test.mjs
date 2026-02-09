/**
 * Tests for post-edit-scanner.cjs hook
 *
 * Hook: PostToolUse(Edit) - non-blocking scanner for common code issues
 *
 * Test Strategy:
 * - Create temp files with known content
 * - Simulate hook input JSON (PostToolUse Edit result)
 * - Execute hook via child_process
 * - Check stderr for warnings
 * - Verify stdout passthrough (non-blocking)
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOK_PATH = '.claude/hooks/session/post-edit-scanner.cjs';

/**
 * Helper: Execute hook with given input
 */
function runHook(filePath, content) {
  // Write temp file
  writeFileSync(filePath, content, 'utf8');

  // Simulate PostToolUse Edit input
  const hookInput = JSON.stringify({
    tool: 'Edit',
    tool_input: {
      file_path: filePath,
      old_string: 'placeholder',
      new_string: 'replacement',
    },
    tool_result: {
      file_path: filePath,
      success: true,
    },
  });

  // Use spawnSync for proper stderr capture
  const result = spawnSync('node', [HOOK_PATH], {
    input: hookInput,
    encoding: 'utf8',
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
}

test('detects console.log in .js file', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'test.js');
  const content = `
function doSomething() {
  console.log('debug message');
  return 42;
}
  `.trim();

  try {
    const result = runHook(testFile, content);

    // Always exits 0 (non-blocking)
    assert.equal(result.exitCode, 0);

    // Passthrough stdout
    const output = JSON.parse(result.stdout);
    assert.ok(output);

    // Warning in stderr
    assert.match(result.stderr, /console\.log/);
    assert.match(result.stderr, /remove before committing/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ignores console.log in comments', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'test.js');
  const content = `
function doSomething() {
  // console.log('this is commented out');
  /* console.log('also commented'); */
  return 42;
}
  `.trim();

  try {
    const result = runHook(testFile, content);

    assert.equal(result.exitCode, 0);

    // No warning (comments ignored)
    assert.doesNotMatch(result.stderr, /console\.log.*detected/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detects print() in .py file only', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));

  try {
    // Python file - should detect
    const pyFile = join(tmpDir, 'test.py');
    const pyContent = `
def do_something():
    print('debug message')
    return 42
    `.trim();

    const pyResult = runHook(pyFile, pyContent);
    assert.equal(pyResult.exitCode, 0);
    assert.match(pyResult.stderr, /print\(\)/);
    assert.match(pyResult.stderr, /use logging instead/);

    // JavaScript file - should NOT detect print()
    const jsFile = join(tmpDir, 'test.js');
    const jsContent = `
function print(msg) {
  console.log(msg);
}
    `.trim();

    const jsResult = runHook(jsFile, jsContent);
    assert.equal(jsResult.exitCode, 0);
    assert.doesNotMatch(jsResult.stderr, /print\(\).*detected/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detects TODO/FIXME/XXX/HACK markers (case-insensitive)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'test.ts');
  const content = `
function doSomething() {
  // TODO: refactor this
  // FIXME: handle edge case
  // XXX: temporary workaround
  // HACK: quick fix
  return 42;
}
  `.trim();

  try {
    const result = runHook(testFile, content);

    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /TODO\/FIXME/);
    assert.match(result.stderr, /address or create task/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('detects hardcoded secret patterns', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'config.js');
  const content = `
const config = {
  api_key: "sk-1234567890abcdef",
  secret: "my_super_secret_password",
  token: "bearer_token_12345678"
};
  `.trim();

  try {
    const result = runHook(testFile, content);

    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /hardcoded secret/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('reports max 5 issues (truncation)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'test.js');

  // Create file with 10 console.log statements
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(`console.log('message ${i}');`);
  }
  const content = lines.join('\n');

  try {
    const result = runHook(testFile, content);

    assert.equal(result.exitCode, 0);

    // Count issue lines in stderr
    const issueLines = result.stderr.split('\n').filter(line => line.includes('Line'));
    assert.ok(issueLines.length <= 5, `Expected max 5 issues, got ${issueLines.length}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handles missing file gracefully (no crash)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const missingFile = join(tmpDir, 'nonexistent.js');

  try {
    const hookInput = JSON.stringify({
      tool: 'Edit',
      tool_input: {
        file_path: missingFile,
      },
      tool_result: {
        file_path: missingFile,
        success: true,
      },
    });

    const result = spawnSync('node', [HOOK_PATH], {
      input: hookInput,
      encoding: 'utf8',
    });

    // Should exit 0 even if file missing
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.ok(output);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('always passes through original JSON to stdout (non-blocking)', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const testFile = join(tmpDir, 'test.js');
  const content = 'console.log("test");';

  try {
    writeFileSync(testFile, content);

    const originalInput = {
      tool: 'Edit',
      tool_input: {
        file_path: testFile,
        old_string: 'old',
        new_string: 'new',
      },
      tool_result: {
        file_path: testFile,
        success: true,
      },
    };

    const result = spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify(originalInput),
      encoding: 'utf8',
    });

    // Parse stdout
    const output = JSON.parse(result.stdout);

    // Should be identical to input (passthrough)
    assert.deepEqual(output, originalInput);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
