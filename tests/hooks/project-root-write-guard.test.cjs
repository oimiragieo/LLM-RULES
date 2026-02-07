#!/usr/bin/env node
/**
 * Tests for project-root-write-guard (Check 10 in unified-pre-write-hook.cjs)
 *
 * Validates that writes to the project root directory are blocked
 * except for known allowlisted files.
 */

'use strict';

const path = require('path');

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    // Handle async tests
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          console.log(`  PASS: ${name}`);
          passed++;
        })
        .catch(err => {
          console.log(`  FAIL: ${name}`);
          console.log(`        ${err.message}`);
          failed++;
        });
      return result;
    }
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message || 'Assertion failed'}: expected truthy value, got ${value}`);
  }
}

function assertIncludes(str, substring, message) {
  if (typeof str !== 'string' || !str.includes(substring)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected string to include "${substring}", got "${str}"`
    );
  }
}

// Load the module
const { CHECKS } = require('../../.claude/hooks/unified-pre-write-hook.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Find the project-root-write-guard check
const rootWriteGuard = CHECKS.find(c => c.name === 'project-root-write-guard');

async function runTests() {
  console.log('========================================');
  console.log('Project Root Write Guard Tests');
  console.log('========================================\n');

  // Save original env
  const originalEnv = process.env.PROJECT_ROOT_WRITE_GUARD;

  // Ensure default enforcement mode for most tests
  delete process.env.PROJECT_ROOT_WRITE_GUARD;

  console.log('--- Check registration ---');

  test('check exists in CHECKS array', () => {
    assertTrue(rootWriteGuard !== undefined, 'rootWriteGuard should be defined');
    assertEqual(rootWriteGuard.name, 'project-root-write-guard', 'check name');
  });

  console.log('\n--- Blocks non-allowlisted files in project root ---');

  await test('blocks random .md files in project root', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'random-file.md'),
    });
    assertEqual(result.pass, false, 'should block');
    assertIncludes(result.message, 'project root', 'message mentions project root');
  });

  await test('blocks mangled-path filenames in project root', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(
        PROJECT_ROOT,
        'Cdevprojectsagent-studio.claudecontexttmptask-70-verification.md'
      ),
    });
    assertEqual(result.pass, false, 'should block mangled path file');
  });

  await test('blocks arbitrary .txt files in project root', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'output.txt'),
    });
    assertEqual(result.pass, false, 'should block');
  });

  await test('blocks arbitrary .json files in project root (non-allowlisted)', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'data.json'),
    });
    assertEqual(result.pass, false, 'should block');
  });

  await test('blocks arbitrary .js files in project root', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'temp-script.js'),
    });
    assertEqual(result.pass, false, 'should block');
  });

  console.log('\n--- Allows known root files ---');

  await test('allows package.json', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'package.json'),
    });
    assertEqual(result.pass, true, 'should allow package.json');
  });

  await test('allows package-lock.json', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'package-lock.json'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows pnpm-lock.yaml', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'pnpm-lock.yaml'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows pnpm-workspace.yaml', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'pnpm-workspace.yaml'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows .gitignore', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.gitignore'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows .gitattributes', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.gitattributes'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows tsconfig.json', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'tsconfig.json'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows jsconfig.json', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'jsconfig.json'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows README.md', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'README.md'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows CHANGELOG.md', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'CHANGELOG.md'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows LICENSE', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'LICENSE'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows .env', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.env'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows .env.example', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.env.example'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows config.yaml', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'config.yaml'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows eslint config files', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.eslintrc.js'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows prettier config files', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.prettierrc.json'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows jest.config.cjs', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'jest.config.cjs'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows eslint.config.js', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'eslint.config.js'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows GETTING_STARTED.md', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'GETTING_STARTED.md'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  console.log('\n--- Allows files in subdirectories ---');

  await test('allows files in .claude subdirectory', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'task-70-verification.md'),
    });
    assertEqual(result.pass, true, 'should allow subdirectory files');
  });

  await test('allows files in src subdirectory', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'src', 'index.ts'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows files in tests subdirectory', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'tests', 'foo.test.js'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows deeply nested files', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'a', 'b', 'c', 'd', 'file.txt'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  console.log('\n--- Allows dotfiles in project root ---');

  await test('allows .prettierignore', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.prettierignore'),
    });
    assertEqual(result.pass, true, 'should allow dotfiles');
  });

  await test('allows .npmrc', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.npmrc'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  await test('allows .editorconfig', async () => {
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, '.editorconfig'),
    });
    assertEqual(result.pass, true, 'should allow');
  });

  console.log('\n--- Edge cases ---');

  await test('passes when no file_path provided', async () => {
    const result = await rootWriteGuard.run('Write', {});
    assertEqual(result.pass, true, 'should pass with no path');
  });

  await test('blocks Edit tool for non-allowlisted root files', async () => {
    const result = await rootWriteGuard.run('Edit', {
      file_path: path.join(PROJECT_ROOT, 'random-file.md'),
    });
    assertEqual(result.pass, false, 'should block Edit too');
  });

  await test('handles forward slashes on Windows', async () => {
    const forwardSlashPath = PROJECT_ROOT.replace(/\\/g, '/') + '/junk-file.txt';
    const result = await rootWriteGuard.run('Write', { file_path: forwardSlashPath });
    assertEqual(result.pass, false, 'should block with forward slashes');
  });

  console.log('\n--- Enforcement mode ---');

  await test('respects off enforcement mode', async () => {
    process.env.PROJECT_ROOT_WRITE_GUARD = 'off';
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'random-file.md'),
    });
    assertEqual(result.pass, true, 'should pass when off');
    delete process.env.PROJECT_ROOT_WRITE_GUARD;
  });

  await test('warns but passes in warn mode', async () => {
    process.env.PROJECT_ROOT_WRITE_GUARD = 'warn';
    const result = await rootWriteGuard.run('Write', {
      file_path: path.join(PROJECT_ROOT, 'random-file.md'),
    });
    assertEqual(result.pass, true, 'should pass when warn');
    assertEqual(result.result, 'warn', 'should set result to warn');
    delete process.env.PROJECT_ROOT_WRITE_GUARD;
  });

  // Restore original env
  if (originalEnv === undefined) {
    delete process.env.PROJECT_ROOT_WRITE_GUARD;
  } else {
    process.env.PROJECT_ROOT_WRITE_GUARD = originalEnv;
  }

  // Wait for any remaining async tests
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n========================================');
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
