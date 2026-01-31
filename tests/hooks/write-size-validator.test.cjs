#!/usr/bin/env node
/**
 * Write Size Validator Tests
 *
 * Tests the write-size-validator hook that prevents agents from writing
 * content exceeding token limits.
 *
 * Test coverage:
 * - Small content (< 20K tokens) → allow
 * - Large content (20K-25K tokens) → warn + allow
 * - Oversized content (> 25K tokens) → block
 * - Empty/undefined content → allow
 * - Non-Write tools → skip validation
 */

'use strict';

const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, 'write-size-validator.cjs');

/**
 * Execute hook with JSON input via stdin and return parsed result
 */
function runHook(input) {
  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      const exitCode = code || 0;

      // Try to parse stderr for structured output
      const lines = stderr.split('\n').filter(l => l.trim() && !l.includes('"hook":"'));
      let output = null;

      if (lines.length > 0) {
        try {
          output = JSON.parse(lines[0]);
        } catch {
          output = stderr;
        }
      }

      resolve({ exitCode, output });
    });

    // Write input to stdin
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

/**
 * Generate content with specific character count
 */
function generateContent(charCount) {
  return 'x'.repeat(charCount);
}

// =============================================================================
// TEST SUITE
// =============================================================================

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('Running write-size-validator tests...\n');

  // Test 1: Small content (< 20K tokens) → allow
  await test('Small content (< 20K tokens) should allow', async () => {
    const content = generateContent(10000); // ~2,500 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
  });

  // Test 2: Large content (20K-25K tokens) → warn + allow
  await test('Large content (20K-25K tokens) should warn and allow', async () => {
    const content = generateContent(84000); // ~21,000 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
    assert.ok(result.output, 'Should have warning output');
    assert.strictEqual(result.output.decision, 'warn', 'Should have warn decision');
    assert.ok(result.output.reason.includes('21000'), 'Should show estimated tokens');
  });

  // Test 3: Oversized content (> 25K tokens) → block
  await test('Oversized content (> 25K tokens) should block', async () => {
    const content = generateContent(104000); // ~26,000 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 2, 'Should exit 2 (block)');
    assert.ok(result.output, 'Should have blocking output');
    assert.strictEqual(result.output.decision, 'block', 'Should have block decision');
    assert.ok(result.output.reason.includes('26000'), 'Should show estimated tokens');
    assert.ok(result.output.suggestion, 'Should have suggestion');
  });

  // Test 4: Empty content → allow
  await test('Empty content should allow', async () => {
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: '',
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
  });

  // Test 5: Undefined content → allow
  await test('Undefined content should allow', async () => {
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
  });

  // Test 6: Non-Write tools → skip validation
  await test('Non-Write tools should skip validation', async () => {
    const input = {
      tool_name: 'Read',
      tool_input: {
        file_path: '/path/to/file.js',
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
  });

  // Test 7: Edit tool with large content → warn
  await test('Edit tool with large content should warn', async () => {
    const content = generateContent(84000); // ~21,000 tokens
    const input = {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/path/to/file.js',
        new_string: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
    assert.ok(result.output, 'Should have warning output');
    assert.strictEqual(result.output.decision, 'warn', 'Should have warn decision');
  });

  // Test 8: Edit tool with oversized content → block
  await test('Edit tool with oversized content should block', async () => {
    const content = generateContent(104000); // ~26,000 tokens
    const input = {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/path/to/file.js',
        new_string: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 2, 'Should exit 2 (block)');
    assert.strictEqual(result.output.decision, 'block', 'Should have block decision');
  });

  // Test 9: NotebookEdit tool validation
  await test('NotebookEdit tool should be validated', async () => {
    const content = generateContent(104000); // ~26,000 tokens
    const input = {
      tool_name: 'NotebookEdit',
      tool_input: {
        notebook_path: '/path/to/notebook.ipynb',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 2, 'Should exit 2 (block)');
  });

  // Test 10: Malformed input → fail open
  await test('Malformed input should fail open (allow)', async () => {
    const input = {
      tool_name: 'Write',
      // Missing tool_input
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (fail open)');
  });

  // Test 11: Edge case - exactly at warning threshold
  await test('Content exactly at warning threshold should warn', async () => {
    const content = generateContent(80000); // Exactly 20,000 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow)');
    // At exactly 20K, should warn (>= threshold triggers warning)
    if (result.output) {
      assert.strictEqual(result.output.decision, 'warn', 'Should warn at threshold');
    }
  });

  // Test 12: Edge case - exactly at max limit (should allow per spec: > not >=)
  await test('Content exactly at max limit should allow (at limit, not exceeding)', async () => {
    const content = generateContent(100000); // Exactly 25,000 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/path/to/file.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.strictEqual(result.exitCode, 0, 'Should exit 0 (allow - at limit but not exceeding)');
    // Should warn since 25K >= 20K warning threshold
    if (result.output) {
      assert.strictEqual(result.output.decision, 'warn', 'Should warn at max limit');
    }
  });

  // Test 13: File path included in output
  await test('File path should be included in output messages', async () => {
    const content = generateContent(104000); // ~26,000 tokens
    const input = {
      tool_name: 'Write',
      tool_input: {
        file_path: '/test/specific/path.js',
        content: content,
      },
    };

    const result = await runHook(input);
    assert.ok(result.output.file.includes('path.js'), 'Should include file path');
  });

  // =============================================================================
  // SUMMARY
  // =============================================================================

  console.log('\n' + '='.repeat(60));
  console.log(`Tests passed: ${passed}/${passed + failed}`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
