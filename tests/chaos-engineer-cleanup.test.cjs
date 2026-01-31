/**
 * Test: ChaosEngineer cleanup between tests
 *
 * Purpose: Verify that ChaosEngineer.cleanup() is called between tests
 * to prevent memory leaks from accumulated testResults and recoveryAttempts.
 */

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const ChaosEngineer = require('../.claude/lib/testing/chaos-engineer.cjs');

describe('ChaosEngineer cleanup between tests', () => {
  let chaos;

  after(async () => {
    if (chaos) await chaos.cleanup();
  });

  afterEach(async () => {
    if (chaos) await chaos.cleanup();
  });

  it('should accumulate testResults without cleanup', async () => {
    chaos = new ChaosEngineer();

    // Run first test
    await chaos.runChaosTest('test1', 1000);
    assert.strictEqual(chaos.testResults.length, 1);

    // Run second test without cleanup
    await chaos.runChaosTest('test2', 1000);
    assert.strictEqual(chaos.testResults.length, 2, 'testResults should accumulate');
  });

  it('should have empty testResults after afterEach cleanup', async () => {
    chaos = new ChaosEngineer();

    // This test should start with empty arrays due to afterEach cleanup
    assert.strictEqual(chaos.testResults.length, 0, 'testResults should be empty after cleanup');
    assert.strictEqual(
      chaos.recoveryAttempts.length,
      0,
      'recoveryAttempts should be empty after cleanup'
    );

    // Run test
    await chaos.runChaosTest('test3', 1000);
    assert.strictEqual(chaos.testResults.length, 1);
  });

  it('should verify cleanup clears both arrays', async () => {
    chaos = new ChaosEngineer();

    // Populate arrays
    await chaos.runChaosTest('test4', 1000);
    await chaos.injectHookFailure('test-hook', 0.5);

    // Verify populated
    assert(chaos.testResults.length > 0, 'testResults should have data');

    // Cleanup
    await chaos.cleanup();

    // Verify cleared
    assert.strictEqual(chaos.testResults.length, 0, 'testResults should be empty after cleanup');
    assert.strictEqual(
      chaos.recoveryAttempts.length,
      0,
      'recoveryAttempts should be empty after cleanup'
    );
    assert.strictEqual(chaos.injections.hooks.size, 0, 'hooks injections should be cleared');
    assert.strictEqual(chaos.injections.tools.size, 0, 'tools injections should be cleared');
  });
});
