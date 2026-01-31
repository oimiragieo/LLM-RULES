#!/usr/bin/env node
/**
 * Tests for anomaly-detector.cjs
 * TDD: Write tests FIRST, then implement
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test utilities
let passed = 0;
let failed = 0;
const tests = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  PASS: ${test.name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL: ${test.name}`);
      console.log(`        ${err.message}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// Create temp directory for tests
const TEST_DIR = path.join(os.tmpdir(), `anomaly-detector-test-${Date.now()}`);
const TEST_STATE_FILE = path.join(TEST_DIR, 'anomaly-state.json');
const TEST_ANOMALY_LOG = path.join(TEST_DIR, 'anomaly-log.jsonl');

// Import the module under test
let detector;
try {
  detector = require('../../.claude/hooks/self-healing/anomaly-detector.cjs');
} catch (_e) {
  console.log('Module not found - this is expected for TDD RED phase');
  console.log('Create anomaly-detector.cjs to proceed');
  process.exit(1);
}

// Setup and teardown
function setup() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  // Set test paths
  detector.setStateFile(TEST_STATE_FILE);
  detector.setAnomalyLog(TEST_ANOMALY_LOG);
  // Clear any existing files
  if (fs.existsSync(TEST_STATE_FILE)) {
    fs.unlinkSync(TEST_STATE_FILE);
  }
  if (fs.existsSync(TEST_ANOMALY_LOG)) {
    fs.unlinkSync(TEST_ANOMALY_LOG);
  }
}

function teardown() {
  // Cleanup
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============================================
// Tests for isEnabled()
// ============================================
describe('isEnabled()', () => {
  it('should return true by default', () => {
    const originalEnv = process.env.ANOMALY_DETECTION_ENABLED;
    delete process.env.ANOMALY_DETECTION_ENABLED;

    const result = detector.isEnabled();

    assertEqual(result, true, 'Should be enabled by default');

    if (originalEnv) process.env.ANOMALY_DETECTION_ENABLED = originalEnv;
  });

  it('should return false when ANOMALY_DETECTION_ENABLED=false', () => {
    const originalEnv = process.env.ANOMALY_DETECTION_ENABLED;
    process.env.ANOMALY_DETECTION_ENABLED = 'false';

    const result = detector.isEnabled();

    assertEqual(result, false, 'Should be disabled');

    if (originalEnv) {
      process.env.ANOMALY_DETECTION_ENABLED = originalEnv;
    } else {
      delete process.env.ANOMALY_DETECTION_ENABLED;
    }
  });
});

// ============================================
// Tests for loadState() / saveState()
// ============================================
describe('loadState() / saveState()', () => {
  it('should return default state when file does not exist', () => {
    setup();

    const state = detector.loadState();

    assert(state !== null, 'Should return state');
    assert(state.tokenHistory !== undefined, 'Should have tokenHistory');
    assert(state.durationHistory !== undefined, 'Should have durationHistory');
    assert(state.failureTracking !== undefined, 'Should have failureTracking');
    assert(state.promptPatterns !== undefined, 'Should have promptPatterns');

    teardown();
  });

  it('should save and load state correctly', () => {
    setup();

    const testState = {
      tokenHistory: [100, 200, 300],
      durationHistory: [1000, 2000, 3000],
      failureTracking: { Bash: { count: 2, lastFailed: '2026-01-25T00:00:00Z' } },
      promptPatterns: [{ hash: 'abc123', count: 1 }],
      lastUpdated: new Date().toISOString(),
    };

    detector.saveState(testState);
    const loaded = detector.loadState();

    assertDeepEqual(loaded.tokenHistory, testState.tokenHistory);
    assertDeepEqual(loaded.durationHistory, testState.durationHistory);

    teardown();
  });
});

// ============================================
// Tests for detectTokenExplosion()
// ============================================
describe('detectTokenExplosion()', () => {
  it('should detect token explosion when current > 2x average', () => {
    const current = 5000;
    const average = 2000;

    const result = detector.detectTokenExplosion(current, average);

    assert(result.detected, 'Should detect explosion');
    assertEqual(result.type, 'token_explosion');
    assert(result.ratio > 2, 'Ratio should be > 2');
  });

  it('should not detect when current is within threshold', () => {
    const current = 3000;
    const average = 2000;

    const result = detector.detectTokenExplosion(current, average);

    assert(!result.detected, 'Should not detect');
  });

  it('should use configurable threshold from env', () => {
    const originalEnv = process.env.ANOMALY_TOKEN_MULTIPLIER;
    process.env.ANOMALY_TOKEN_MULTIPLIER = '3';

    const current = 5000;
    const average = 2000;

    // Need to reload thresholds
    const threshold = detector.getThresholds();
    const result = detector.detectTokenExplosion(current, average, threshold.tokenMultiplier);

    assert(!result.detected, 'Should not detect with 3x threshold');

    if (originalEnv) {
      process.env.ANOMALY_TOKEN_MULTIPLIER = originalEnv;
    } else {
      delete process.env.ANOMALY_TOKEN_MULTIPLIER;
    }
  });

  it('should return safe result when average is 0', () => {
    const current = 1000;
    const average = 0;

    const result = detector.detectTokenExplosion(current, average);

    assert(!result.detected, 'Should not detect with zero average');
  });
});

// ============================================
// Tests for detectDurationSpike()
// ============================================
describe('detectDurationSpike()', () => {
  it('should detect duration spike when current > 3x average', () => {
    const current = 10000; // 10 seconds
    const average = 2000; // 2 seconds

    const result = detector.detectDurationSpike(current, average);

    assert(result.detected, 'Should detect spike');
    assertEqual(result.type, 'duration_spike');
    assert(result.ratio > 3, 'Ratio should be > 3');
  });

  it('should not detect when current is within threshold', () => {
    const current = 5000;
    const average = 2000;

    const result = detector.detectDurationSpike(current, average);

    assert(!result.detected, 'Should not detect');
  });

  it('should use configurable threshold from env', () => {
    const originalEnv = process.env.ANOMALY_DURATION_MULTIPLIER;
    process.env.ANOMALY_DURATION_MULTIPLIER = '5';

    const current = 8000;
    const average = 2000;

    const threshold = detector.getThresholds();
    const result = detector.detectDurationSpike(current, average, threshold.durationMultiplier);

    assert(!result.detected, 'Should not detect with 5x threshold');

    if (originalEnv) {
      process.env.ANOMALY_DURATION_MULTIPLIER = originalEnv;
    } else {
      delete process.env.ANOMALY_DURATION_MULTIPLIER;
    }
  });
});

// ============================================
// Tests for detectRepeatedFailures()
// ============================================
describe('detectRepeatedFailures()', () => {
  it('should detect when same tool fails 3+ times', () => {
    setup();

    const state = detector.loadState();
    state.failureTracking = {
      Bash: { count: 3, lastFailed: new Date().toISOString(), errors: ['err1', 'err2', 'err3'] },
    };
    detector.saveState(state);

    const result = detector.detectRepeatedFailures('Bash', state);

    assert(result.detected, 'Should detect repeated failures');
    assertEqual(result.type, 'repeated_failures');
    assertEqual(result.tool, 'Bash');
    assertEqual(result.count, 3);

    teardown();
  });

  it('should not detect when failures are below threshold', () => {
    setup();

    const state = detector.loadState();
    state.failureTracking = {
      Bash: { count: 2, lastFailed: new Date().toISOString(), errors: ['err1', 'err2'] },
    };

    const result = detector.detectRepeatedFailures('Bash', state);

    assert(!result.detected, 'Should not detect');

    teardown();
  });

  it('should track failures per tool independently', () => {
    setup();

    const state = detector.loadState();
    state.failureTracking = {
      Bash: { count: 3, lastFailed: new Date().toISOString() },
      Edit: { count: 1, lastFailed: new Date().toISOString() },
    };

    const bashResult = detector.detectRepeatedFailures('Bash', state);
    const editResult = detector.detectRepeatedFailures('Edit', state);

    assert(bashResult.detected, 'Bash should be detected');
    assert(!editResult.detected, 'Edit should not be detected');

    teardown();
  });

  it('should use configurable failure count threshold', () => {
    const originalEnv = process.env.ANOMALY_FAILURE_COUNT;
    process.env.ANOMALY_FAILURE_COUNT = '5';

    setup();

    const state = detector.loadState();
    state.failureTracking = {
      Bash: { count: 4, lastFailed: new Date().toISOString() },
    };

    const threshold = detector.getThresholds();
    const result = detector.detectRepeatedFailures('Bash', state, threshold.failureCount);

    assert(!result.detected, 'Should not detect with 5 threshold');

    if (originalEnv) {
      process.env.ANOMALY_FAILURE_COUNT = originalEnv;
    } else {
      delete process.env.ANOMALY_FAILURE_COUNT;
    }
    teardown();
  });
});

// ============================================
// Tests for detectLoopRisk()
// ============================================
describe('detectLoopRisk()', () => {
  it('should detect loop risk when same prompt pattern repeats', () => {
    setup();

    const prompt = 'Fix the login bug';
    const state = detector.loadState();

    // Simulate seeing same prompt twice already
    const hash = detector.hashPrompt(prompt);
    state.promptPatterns = [{ hash, count: 2, lastSeen: new Date().toISOString() }];
    detector.saveState(state);

    const result = detector.detectLoopRisk(prompt, state);

    assert(result.detected, 'Should detect loop risk');
    assertEqual(result.type, 'infinite_loop_risk');
    assertEqual(result.repetitions, 2);

    teardown();
  });

  it('should not detect on first occurrence', () => {
    setup();

    const prompt = 'New unique prompt';
    const state = detector.loadState();
    state.promptPatterns = [];

    const result = detector.detectLoopRisk(prompt, state);

    assert(!result.detected, 'Should not detect on first occurrence');

    teardown();
  });

  it('should use configurable repetition threshold', () => {
    const originalEnv = process.env.ANOMALY_PATTERN_REPS;
    process.env.ANOMALY_PATTERN_REPS = '3';

    setup();

    const prompt = 'Fix the login bug';
    const state = detector.loadState();
    const hash = detector.hashPrompt(prompt);
    state.promptPatterns = [{ hash, count: 2, lastSeen: new Date().toISOString() }];

    const threshold = detector.getThresholds();
    const result = detector.detectLoopRisk(prompt, state, threshold.patternRepetitions);

    assert(!result.detected, 'Should not detect with 3 threshold');

    if (originalEnv) {
      process.env.ANOMALY_PATTERN_REPS = originalEnv;
    } else {
      delete process.env.ANOMALY_PATTERN_REPS;
    }
    teardown();
  });

  it('should normalize prompts before hashing', () => {
    const prompt1 = '  Fix the LOGIN bug  ';
    const prompt2 = 'fix the login bug';

    const hash1 = detector.hashPrompt(prompt1);
    const hash2 = detector.hashPrompt(prompt2);

    assertEqual(hash1, hash2, 'Normalized prompts should have same hash');
  });
});

// ============================================
// Tests for detectResourceExhaustion()
// ============================================
describe('detectResourceExhaustion()', () => {
  it('should detect high memory usage', () => {
    // Mock high memory
    const metrics = {
      heapUsed: 900 * 1024 * 1024, // 900MB
      heapTotal: 1000 * 1024 * 1024, // 1GB
      external: 10 * 1024 * 1024,
    };

    const result = detector.detectResourceExhaustion(metrics);

    // Should detect if heap usage > 90%
    assert(result.detected || result.warning, 'Should detect or warn high memory');
    assertEqual(result.type, 'resource_exhaustion');
  });

  it('should not detect normal memory usage', () => {
    const metrics = {
      heapUsed: 100 * 1024 * 1024, // 100MB
      heapTotal: 1000 * 1024 * 1024, // 1GB
      external: 10 * 1024 * 1024,
    };

    const result = detector.detectResourceExhaustion(metrics);

    assert(!result.detected, 'Should not detect normal usage');
  });
});

// ============================================
// Tests for logAnomaly()
// ============================================
describe('logAnomaly()', () => {
  it('should append anomaly to log file', () => {
    setup();

    const anomaly = {
      type: 'token_explosion',
      detected: true,
      ratio: 2.5,
      current: 5000,
      average: 2000,
    };

    detector.logAnomaly(anomaly);

    assert(fs.existsSync(TEST_ANOMALY_LOG), 'Log file should exist');

    const content = fs.readFileSync(TEST_ANOMALY_LOG, 'utf8');
    const lines = content.trim().split('\n');
    assert(lines.length === 1, 'Should have one log entry');

    const logged = JSON.parse(lines[0]);
    assertEqual(logged.type, 'token_explosion');
    assert(logged.timestamp !== undefined, 'Should have timestamp');

    teardown();
  });

  it('should append multiple anomalies', () => {
    setup();

    detector.logAnomaly({ type: 'anomaly1', detected: true });
    detector.logAnomaly({ type: 'anomaly2', detected: true });

    const content = fs.readFileSync(TEST_ANOMALY_LOG, 'utf8');
    const lines = content.trim().split('\n');
    assertEqual(lines.length, 2, 'Should have two log entries');

    teardown();
  });
});

// ============================================
// Tests for recordFailure()
// ============================================
describe('recordFailure()', () => {
  it('should increment failure count for tool', () => {
    setup();

    const state = detector.loadState();
    detector.recordFailure('Bash', 'Command not found', state);
    detector.saveState(state);

    const loaded = detector.loadState();
    assert(loaded.failureTracking.Bash !== undefined, 'Should track Bash');
    assertEqual(loaded.failureTracking.Bash.count, 1);

    teardown();
  });

  it('should accumulate failures', () => {
    setup();

    const state = detector.loadState();
    detector.recordFailure('Bash', 'Error 1', state);
    detector.recordFailure('Bash', 'Error 2', state);
    detector.recordFailure('Bash', 'Error 3', state);
    detector.saveState(state);

    const loaded = detector.loadState();
    assertEqual(loaded.failureTracking.Bash.count, 3);

    teardown();
  });
});

// ============================================
// Tests for recordTokenUsage()
// ============================================
describe('recordTokenUsage()', () => {
  it('should add to token history', () => {
    setup();

    const state = detector.loadState();
    detector.recordTokenUsage(1000, state);
    detector.recordTokenUsage(2000, state);
    detector.saveState(state);

    const loaded = detector.loadState();
    assert(loaded.tokenHistory.includes(1000));
    assert(loaded.tokenHistory.includes(2000));

    teardown();
  });

  it('should limit history size', () => {
    setup();

    const state = detector.loadState();
    // Add more than the limit
    for (let i = 0; i < 150; i++) {
      detector.recordTokenUsage(i * 100, state);
    }
    detector.saveState(state);

    const loaded = detector.loadState();
    assert(loaded.tokenHistory.length <= 100, 'Should limit to 100 entries');

    teardown();
  });
});

// ============================================
// Tests for recordPromptPattern()
// ============================================
describe('recordPromptPattern()', () => {
  it('should record new prompt pattern', () => {
    setup();

    const state = detector.loadState();
    detector.recordPromptPattern('Test prompt', state);
    detector.saveState(state);

    const loaded = detector.loadState();
    assertEqual(loaded.promptPatterns.length, 1);
    assertEqual(loaded.promptPatterns[0].count, 1);

    teardown();
  });

  it('should increment count for repeated patterns', () => {
    setup();

    const state = detector.loadState();
    detector.recordPromptPattern('Test prompt', state);
    detector.recordPromptPattern('Test prompt', state);
    detector.saveState(state);

    const loaded = detector.loadState();
    assertEqual(loaded.promptPatterns.length, 1);
    assertEqual(loaded.promptPatterns[0].count, 2);

    teardown();
  });
});

// ============================================
// Tests for getThresholds()
// ============================================
describe('getThresholds()', () => {
  it('should return default thresholds', () => {
    const originalEnvs = {
      token: process.env.ANOMALY_TOKEN_MULTIPLIER,
      duration: process.env.ANOMALY_DURATION_MULTIPLIER,
      failure: process.env.ANOMALY_FAILURE_COUNT,
      pattern: process.env.ANOMALY_PATTERN_REPS,
    };

    delete process.env.ANOMALY_TOKEN_MULTIPLIER;
    delete process.env.ANOMALY_DURATION_MULTIPLIER;
    delete process.env.ANOMALY_FAILURE_COUNT;
    delete process.env.ANOMALY_PATTERN_REPS;

    const thresholds = detector.getThresholds();

    assertEqual(thresholds.tokenMultiplier, 2, 'Default token multiplier should be 2');
    assertEqual(thresholds.durationMultiplier, 3, 'Default duration multiplier should be 3');
    assertEqual(thresholds.failureCount, 3, 'Default failure count should be 3');
    assertEqual(thresholds.patternRepetitions, 2, 'Default pattern reps should be 2');

    // Restore
    if (originalEnvs.token) process.env.ANOMALY_TOKEN_MULTIPLIER = originalEnvs.token;
    if (originalEnvs.duration) process.env.ANOMALY_DURATION_MULTIPLIER = originalEnvs.duration;
    if (originalEnvs.failure) process.env.ANOMALY_FAILURE_COUNT = originalEnvs.failure;
    if (originalEnvs.pattern) process.env.ANOMALY_PATTERN_REPS = originalEnvs.pattern;
  });

  it('should parse env overrides', () => {
    process.env.ANOMALY_TOKEN_MULTIPLIER = '4';
    process.env.ANOMALY_DURATION_MULTIPLIER = '5';
    process.env.ANOMALY_FAILURE_COUNT = '10';
    process.env.ANOMALY_PATTERN_REPS = '5';

    const thresholds = detector.getThresholds();

    assertEqual(thresholds.tokenMultiplier, 4);
    assertEqual(thresholds.durationMultiplier, 5);
    assertEqual(thresholds.failureCount, 10);
    assertEqual(thresholds.patternRepetitions, 5);

    delete process.env.ANOMALY_TOKEN_MULTIPLIER;
    delete process.env.ANOMALY_DURATION_MULTIPLIER;
    delete process.env.ANOMALY_FAILURE_COUNT;
    delete process.env.ANOMALY_PATTERN_REPS;
  });
});

// ============================================
// Tests for calculateAverage()
// ============================================
describe('calculateAverage()', () => {
  it('should calculate average of array', () => {
    const avg = detector.calculateAverage([100, 200, 300]);
    assertEqual(avg, 200);
  });

  it('should return 0 for empty array', () => {
    const avg = detector.calculateAverage([]);
    assertEqual(avg, 0);
  });

  it('should handle single element', () => {
    const avg = detector.calculateAverage([500]);
    assertEqual(avg, 500);
  });
});

// ============================================
// Integration test
// ============================================
describe('Integration: Full Detection Flow', () => {
  it('should detect and log token explosion', () => {
    setup();

    // Setup state with history
    const state = detector.loadState();
    state.tokenHistory = [1000, 1200, 1100, 1000, 1300];
    detector.saveState(state);

    // Detect with high token count
    const result = detector.detectTokenExplosion(
      5000,
      detector.calculateAverage(state.tokenHistory)
    );

    if (result.detected) {
      detector.logAnomaly(result);
    }

    assert(result.detected, 'Should detect token explosion');
    assert(fs.existsSync(TEST_ANOMALY_LOG), 'Should log anomaly');

    teardown();
  });
});

// Run all tests
(async () => {
  console.log('Running anomaly-detector.cjs tests...\n');

  await runTests();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);

  process.exit(failed > 0 ? 1 : 0);
})();
