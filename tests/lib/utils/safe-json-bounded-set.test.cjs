'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

test('test warnedSchemas Set does not exceed MAX_WARNED_SCHEMAS', () => {
  // Mock stderr to suppress warnings during test
  const originalStderr = process.stderr.write;
  let warnCount = 0;
  process.stderr.write = function(chunk) {
    if (chunk.toString().includes('WARN')) warnCount++;
    return true;
  };

  try {
    // Call safeParseJSON 250 times with unique schema violations to fill the Set
    for (let i = 0; i < 250; i++) {
      safeParseJSON('{"unexpected":"value"}', `test-schema-${i}`, {
        expected: {
          type: 'string',
          required: true,
        },
      }, {
        expected: 'default',
      });
    }

    // Reset warn count
    warnCount = 0;

    // Call with the first schema again - should warn because it was evicted (after 200 capacity)
    safeParseJSON('{"unexpected":"value"}', 'test-schema-0', {
      expected: {
        type: 'string',
        required: true,
      },
    }, {
      expected: 'default',
    });

    // Should have triggered a warning (key was evicted from bounded Set)
    assert.ok(warnCount > 0, 'After 250 calls, first key should be evicted and warn again');
  } finally {
    process.stderr.write = originalStderr;
  }
});

test('test FIFO eviction removes oldest entry', () => {
  const originalStderr = process.stderr.write;
  const warnings = [];
  process.stderr.write = function(chunk) {
    warnings.push(chunk.toString());
    return true;
  };

  try {
    // Fill to capacity + 1
    for (let i = 0; i < 201; i++) {
      safeParseJSON('{"bad":"data"}', `evict-test-${i}`, {
        good: {
          type: 'string',
          required: true,
        },
      }, {
        good: 'default',
      });
    }

    warnings.length = 0; // Clear

    // Call with first key again - should warn (was evicted)
    safeParseJSON('{"bad":"data"}', 'evict-test-0', {
      good: {
        type: 'string',
        required: true,
      },
    }, {
      good: 'default',
    });

    // Should have new warning for evict-test-0
    assert.ok(warnings.length > 0, 'Oldest key should be evicted after exceeding capacity');
  } finally {
    process.stderr.write = originalStderr;
  }
});

test('test Set size remains bounded at exactly MAX_WARNED_SCHEMAS', () => {
  // We can't directly access the internal Set, so we test behavior:
  // After adding MAX_WARNED_SCHEMAS + 50 unique keys, the first 50 should be evicted
  const originalStderr = process.stderr.write;
  const warnKeys = new Set();
  process.stderr.write = function(chunk) {
    const match = chunk.toString().match(/test-schema: (size-test-\d+)/);
    if (match) warnKeys.add(match[1]);
    return true;
  };

  try {
    // Add 250 unique schema warnings (MAX is 200)
    for (let i = 0; i < 250; i++) {
      safeParseJSON('{"x":"y"}', `size-test-${i}`, {
        required: {
          type: 'string',
          required: true,
        },
      }, {
        required: 'default',
      });
    }

    warnKeys.clear();

    // Test first 50 keys - all should warn again (evicted)
    for (let i = 0; i < 50; i++) {
      safeParseJSON('{"x":"y"}', `size-test-${i}`, {
        required: {
          type: 'string',
          required: true,
        },
      }, {
        required: 'default',
      });
    }

    // Should have warnings for evicted keys
    assert.ok(warnKeys.size > 40, `Expected 50 re-warnings for evicted keys, got ${warnKeys.size}`);
  } finally {
    process.stderr.write = originalStderr;
  }
});

test('test normal warning deduplication still works within capacity', () => {
  const originalStderr = process.stderr.write;
  let warnCount = 0;
  process.stderr.write = function(chunk) {
    if (chunk.toString().includes('dedup-test')) warnCount++;
    return true;
  };

  try {
    // Call twice with same schema key
    safeParseJSON('{"a":"b"}', 'dedup-test', {
      c: {
        type: 'string',
        required: true,
      },
    }, {
      c: 'default',
    });

    const firstCount = warnCount;

    safeParseJSON('{"a":"b"}', 'dedup-test', {
      c: {
        type: 'string',
        required: true,
      },
    }, {
      c: 'default',
    });

    // Second call should NOT add warning (dedup works)
    assert.strictEqual(warnCount, firstCount,
      'Second call with same schema should not produce another warning (dedup works)');
  } finally {
    process.stderr.write = originalStderr;
  }
});
