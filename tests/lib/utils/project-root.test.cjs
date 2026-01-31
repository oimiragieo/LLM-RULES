#!/usr/bin/env node
/**
 * Test for findProjectRoot utility
 * BUG-001 fix: Prevent nested .claude folder creation
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Simple test runner
if (require.main === module) {
  console.log('Running project-root tests...\n');

  const tempDir = path.join(os.tmpdir(), 'project-root-test-' + Date.now());
  const projectDir = path.join(tempDir, 'my-project');
  const claudeDir = path.join(projectDir, '.claude');
  const nestedDir = path.join(projectDir, 'src', 'components', 'deep');

  try {
    // Setup
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test CLAUDE.md');

    // Load module
    const mod = require('../../../.claude/lib/utils/project-root.cjs');

    // Test 1: Find from nested directory
    const result1 = mod.findProjectRoot(nestedDir);
    assert.strictEqual(result1, projectDir, 'Should find project root from nested dir');
    console.log('[PASS] Test 1: Find from nested directory');

    // Test 2: Find from project directory
    const result2 = mod.findProjectRoot(projectDir);
    assert.strictEqual(result2, projectDir, 'Should find project root from project dir');
    console.log('[PASS] Test 2: Find from project directory');

    // Test 3: Find from .claude directory
    const result3 = mod.findProjectRoot(claudeDir);
    assert.strictEqual(result3, projectDir, 'Should find project root from .claude dir');
    console.log('[PASS] Test 3: Find from .claude directory');

    // Test 4: Fallback when not found
    const noProjectDir = path.join(tempDir, 'no-project');
    fs.mkdirSync(noProjectDir, { recursive: true });
    const result4 = mod.findProjectRoot(noProjectDir);
    assert.strictEqual(result4, noProjectDir, 'Should fallback to startDir');
    console.log('[PASS] Test 4: Fallback when not found');
    fs.rmSync(noProjectDir, { recursive: true, force: true });

    // Test 5: Works with real project
    const result5 = mod.findProjectRoot(__dirname);
    assert.ok(
      fs.existsSync(path.join(result5, '.claude', 'CLAUDE.md')),
      'Should find real project'
    );
    console.log('[PASS] Test 5: Works with real project');

    // Test 6: PROJECT_ROOT export
    assert.ok(mod.PROJECT_ROOT, 'Should export PROJECT_ROOT');
    assert.ok(
      fs.existsSync(path.join(mod.PROJECT_ROOT, '.claude', 'CLAUDE.md')),
      'PROJECT_ROOT should be valid'
    );
    console.log('[PASS] Test 6: PROJECT_ROOT export');

    // ==========================================================================
    // CRITICAL-001 FIX: Path Traversal Prevention Tests
    // ==========================================================================

    // Test 7: validatePathWithinProject exports
    assert.ok(mod.validatePathWithinProject, 'Should export validatePathWithinProject');
    assert.ok(mod.sanitizePath, 'Should export sanitizePath');
    assert.ok(mod.PATH_TRAVERSAL_PATTERNS, 'Should export PATH_TRAVERSAL_PATTERNS');
    console.log('[PASS] Test 7: Path validation exports');

    // Test 8: Safe paths are allowed
    const safe1 = mod.validatePathWithinProject('src/file.js', projectDir);
    assert.strictEqual(safe1.safe, true, 'Relative path within project should be safe');
    const safe2 = mod.validatePathWithinProject('.claude/CLAUDE.md', projectDir);
    assert.strictEqual(safe2.safe, true, 'Dotfile path within project should be safe');
    console.log('[PASS] Test 8: Safe paths are allowed');

    // Test 9: Basic traversal is blocked
    const trav1 = mod.validatePathWithinProject('../../../etc/passwd', projectDir);
    assert.strictEqual(trav1.safe, false, 'Basic traversal should be blocked');
    const trav2 = mod.validatePathWithinProject('src/../../../etc/passwd', projectDir);
    assert.strictEqual(trav2.safe, false, 'Middle traversal should be blocked');
    console.log('[PASS] Test 9: Basic traversal blocked');

    // Test 10: URL-encoded traversal is blocked
    const enc1 = mod.validatePathWithinProject('%2e%2e/etc/passwd', projectDir);
    assert.strictEqual(enc1.safe, false, 'URL-encoded traversal should be blocked');
    const enc2 = mod.validatePathWithinProject('%252e%252e/etc/passwd', projectDir);
    assert.strictEqual(enc2.safe, false, 'Double-encoded traversal should be blocked');
    console.log('[PASS] Test 10: URL-encoded traversal blocked');

    // Test 11: Null bytes are blocked
    const null1 = mod.validatePathWithinProject('file.txt\x00../etc/passwd', projectDir);
    assert.strictEqual(null1.safe, false, 'Null byte injection should be blocked');
    console.log('[PASS] Test 11: Null bytes blocked');

    // Test 12: Empty/null/undefined paths are blocked (fail-closed)
    const empty1 = mod.validatePathWithinProject('', projectDir);
    assert.strictEqual(empty1.safe, false, 'Empty path should be blocked');
    const empty2 = mod.validatePathWithinProject(null, projectDir);
    assert.strictEqual(empty2.safe, false, 'Null path should be blocked');
    const empty3 = mod.validatePathWithinProject(undefined, projectDir);
    assert.strictEqual(empty3.safe, false, 'Undefined path should be blocked');
    console.log('[PASS] Test 12: Empty/null/undefined paths blocked');

    // Test 13: sanitizePath throws on unsafe paths
    let threw = false;
    try {
      mod.sanitizePath('../../../etc/passwd', projectDir);
    } catch (e) {
      threw = true;
      assert.ok(
        e.message.includes('Path validation failed'),
        'Error message should indicate validation failure'
      );
    }
    assert.strictEqual(threw, true, 'sanitizePath should throw on unsafe path');
    console.log('[PASS] Test 13: sanitizePath throws on unsafe paths');

    // Test 14: sanitizePath returns resolved path on safe paths
    const resolved = mod.sanitizePath('src/file.js', projectDir);
    assert.strictEqual(
      resolved,
      path.resolve(projectDir, 'src/file.js'),
      'sanitizePath should return resolved path'
    );
    console.log('[PASS] Test 14: sanitizePath returns resolved path');

    console.log('\n[SUCCESS] All 14 tests passed!');
  } catch (e) {
    console.error('\n[FAIL]', e.message);
    process.exitCode = 1;
  } finally {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
