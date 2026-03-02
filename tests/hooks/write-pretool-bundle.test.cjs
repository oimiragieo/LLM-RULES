/**
 * Write PreTool Bundle Tests
 *
 * Verifies fail-CLOSED behavior for unexpected exceptions in write safety hooks.
 *
 * Security rationale:
 * - Write safety hooks (routing guard, creator guard, agent contract, etc.) protect
 *   against unauthorized file writes. Failing open on crash bypasses ALL safety checks.
 * - The hook now defaults to fail-closed (exit 2) unless WRITE_HOOK_FAIL_OPEN=true.
 *
 * Test execution: node --test tests/hooks/write-pretool-bundle.test.cjs
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/write-pretool-bundle.cjs');

describe('write-pretool-bundle fail behavior', () => {
  test('source code defaults to fail-closed (not fail-open)', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');

    // The catch block should exit(2) by default (fail-closed for security)
    // and only exit(0) when WRITE_HOOK_FAIL_OPEN is explicitly set
    assert.ok(
      src.includes('WRITE_HOOK_FAIL_OPEN'),
      'Should use WRITE_HOOK_FAIL_OPEN env var for opt-in permissive behavior'
    );
    assert.equal(
      src.includes('process.stdout.write(JSON.stringify(hookInput))'),
      false,
      'Should not passthrough full hookInput JSON (can cause truncation parse failures)'
    );
  });

  test('catch block exits 2 by default (fail-closed)', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');

    // Extract everything after "} catch (err) {"
    const catchIdx = src.indexOf('} catch (err) {');
    assert.ok(catchIdx > -1, 'Should have a catch block');

    const catchBody = src.slice(catchIdx, catchIdx + 500);

    // The default path should be process.exit(2) (fail-closed)
    assert.ok(
      catchBody.includes('process.exit(2)'),
      'Catch block should have process.exit(2) as default (fail-closed) path'
    );

    // process.exit(0) should only be reached when WRITE_HOOK_FAIL_OPEN is true
    if (catchBody.includes('process.exit(0)')) {
      assert.ok(
        catchBody.includes('WRITE_HOOK_FAIL_OPEN'),
        'process.exit(0) in catch should be gated behind WRITE_HOOK_FAIL_OPEN'
      );
    }
  });
});
