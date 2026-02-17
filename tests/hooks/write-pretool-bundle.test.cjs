/**
 * Write PreTool Bundle Tests
 *
 * Verifies fail-open behavior for unexpected exceptions.
 *
 * Bug fix validated:
 * - H-7: write-pretool-bundle.cjs was fail-closed by default —
 *   unexpected exceptions blocked ALL Write/Edit operations.
 *   Now defaults to fail-open (exit 0) unless HOOK_FAIL_CLOSED=true.
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
  test('source code defaults to fail-open (not fail-closed)', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');

    // The catch block should exit(0) by default (fail-open)
    // and only exit(2) when HOOK_FAIL_CLOSED is explicitly set
    assert.ok(
      src.includes('HOOK_FAIL_CLOSED'),
      'Should use HOOK_FAIL_CLOSED env var for opt-in blocking'
    );

    // Should NOT have the old pattern of failing closed by default
    assert.ok(
      !src.includes("HOOK_FAIL_OPEN === 'true'"),
      'Should NOT use HOOK_FAIL_OPEN (old pattern was fail-closed by default)'
    );
  });

  test('catch block exits 0 by default (fail-open)', () => {
    const src = fs.readFileSync(HOOK_PATH, 'utf8');

    // Extract everything after "} catch (err) {"
    const catchIdx = src.indexOf('} catch (err) {');
    assert.ok(catchIdx > -1, 'Should have a catch block');

    const catchBody = src.slice(catchIdx, catchIdx + 500);

    // The default path should be process.exit(0)
    assert.ok(
      catchBody.includes('process.exit(0)'),
      'Catch block should have process.exit(0) as default (fail-open) path'
    );

    // process.exit(2) should only be reached when HOOK_FAIL_CLOSED is true
    if (catchBody.includes('process.exit(2)')) {
      assert.ok(
        catchBody.includes('HOOK_FAIL_CLOSED'),
        'process.exit(2) in catch should be gated behind HOOK_FAIL_CLOSED'
      );
    }
  });
});
