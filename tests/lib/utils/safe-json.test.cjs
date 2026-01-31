#!/usr/bin/env node
/**
 * Tests for safe-json.cjs (SEC-007)
 *
 * Tests JSON schema validation and safe parsing to prevent
 * prototype pollution and injection attacks.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    failCount++;
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

// =============================================================================
// Test Helpers
// =============================================================================

function createTempFile(content) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(
    tmpDir,
    `safe-json-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

function cleanupTempFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// =============================================================================
// Test Suite
// =============================================================================

async function runTests() {
  console.log('Safe JSON Tests (SEC-007)');
  console.log('=========================');

  // Load module
  const safeJson = require('../../../.claude/lib/utils/safe-json.cjs');

  await describe('safeParseJSON', async () => {
    await test('should parse valid JSON with known schema', () => {
      const content = '{"mode": "agent", "complexity": "high", "plannerSpawned": true}';
      const result = safeJson.safeParseJSON(content, 'router-state');

      assertEqual(result.mode, 'agent', 'mode should be agent');
      assertEqual(result.complexity, 'high', 'complexity should be high');
      assertEqual(result.plannerSpawned, true, 'plannerSpawned should be true');
    });

    await test('should return defaults for invalid JSON', () => {
      const content = 'not valid json';
      const result = safeJson.safeParseJSON(content, 'router-state');

      assertEqual(result.mode, 'router', 'mode should default to router');
      assertEqual(result.complexity, 'trivial', 'complexity should default to trivial');
      assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
    });

    await test('should strip unknown properties when schema exists', () => {
      const content = '{"mode": "agent", "malicious": "payload", "__proto__": {"polluted": true}}';
      const result = safeJson.safeParseJSON(content, 'router-state');

      assertEqual(result.mode, 'agent', 'mode should be agent');
      assertEqual(result.malicious, undefined, 'malicious should be undefined');
      // __proto__ should not be an own property of result
      assert(
        !Object.prototype.hasOwnProperty.call(result, '__proto__'),
        '__proto__ should not be own property'
      );
      assertEqual(result.polluted, undefined, 'polluted should be undefined');
    });

    await test('should handle prototype pollution attempts', () => {
      const content =
        '{"__proto__": {"isAdmin": true}, "constructor": {"prototype": {"isAdmin": true}}}';
      const result = safeJson.safeParseJSON(content, 'router-state');

      // Verify prototype was not polluted
      const testObj = {};
      assertEqual(testObj.isAdmin, undefined, 'prototype should not be polluted');

      // Result should have defaults
      assertEqual(result.mode, 'router', 'mode should default to router');
    });

    await test('should use defaults for missing properties', () => {
      const content = '{"mode": "agent"}';
      const result = safeJson.safeParseJSON(content, 'router-state');

      assertEqual(result.mode, 'agent', 'mode should be agent');
      assertEqual(result.complexity, 'trivial', 'complexity should default to trivial');
      assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
    });

    await test('should parse JSON without schema (no stripping)', () => {
      const content = '{"foo": "bar", "num": 42}';
      const result = safeJson.safeParseJSON(content, null);

      assertEqual(result.foo, 'bar', 'foo should be bar');
      assertEqual(result.num, 42, 'num should be 42');
    });

    await test('should return empty object for invalid JSON without schema', () => {
      const content = 'invalid';
      const result = safeJson.safeParseJSON(content, null);

      assertDeepEqual(result, {}, 'should return empty object');
    });

    await test('should handle loop-state schema', () => {
      const content = '{"sessionId": "test-123", "spawnDepth": 2, "evolutionCount": 1}';
      const result = safeJson.safeParseJSON(content, 'loop-state');

      assertEqual(result.sessionId, 'test-123', 'sessionId should be test-123');
      assertEqual(result.spawnDepth, 2, 'spawnDepth should be 2');
      assertEqual(result.evolutionCount, 1, 'evolutionCount should be 1');
    });

    await test('should return loop-state defaults for invalid JSON', () => {
      const content = 'invalid';
      const result = safeJson.safeParseJSON(content, 'loop-state');

      assertEqual(result.sessionId, '', 'sessionId should default to empty string');
      assertEqual(result.spawnDepth, 0, 'spawnDepth should default to 0');
      assertEqual(result.evolutionCount, 0, 'evolutionCount should default to 0');
    });
  });

  await describe('safeReadJSON', async () => {
    await test('should read and parse valid JSON file', () => {
      const tmpFile = createTempFile('{"mode": "agent", "complexity": "low"}');

      try {
        const result = safeJson.safeReadJSON(tmpFile, 'router-state');

        assertEqual(result.mode, 'agent', 'mode should be agent');
        assertEqual(result.complexity, 'low', 'complexity should be low');
        assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
      } finally {
        cleanupTempFile(tmpFile);
      }
    });

    await test('should return defaults for non-existent file', () => {
      const result = safeJson.safeReadJSON('/nonexistent/path/file.json', 'router-state');

      assertEqual(result.mode, 'router', 'mode should default to router');
      assertEqual(result.complexity, 'trivial', 'complexity should default to trivial');
      assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
    });

    await test('should return defaults for corrupted file', () => {
      const tmpFile = createTempFile('corrupted { json }');

      try {
        const result = safeJson.safeReadJSON(tmpFile, 'router-state');

        assertEqual(result.mode, 'router', 'mode should default to router');
        assertEqual(result.complexity, 'trivial', 'complexity should default to trivial');
        assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
      } finally {
        cleanupTempFile(tmpFile);
      }
    });

    await test('should strip unknown properties from file content', () => {
      const tmpFile = createTempFile('{"mode": "agent", "malicious": "data"}');

      try {
        const result = safeJson.safeReadJSON(tmpFile, 'router-state');

        assertEqual(result.mode, 'agent', 'mode should be agent');
        assertEqual(result.malicious, undefined, 'malicious should be undefined');
      } finally {
        cleanupTempFile(tmpFile);
      }
    });

    await test('should handle empty file', () => {
      const tmpFile = createTempFile('');

      try {
        const result = safeJson.safeReadJSON(tmpFile, 'router-state');

        assertEqual(result.mode, 'router', 'mode should default to router');
        assertEqual(result.complexity, 'trivial', 'complexity should default to trivial');
        assertEqual(result.plannerSpawned, false, 'plannerSpawned should default to false');
      } finally {
        cleanupTempFile(tmpFile);
      }
    });
  });

  await describe('SCHEMAS', async () => {
    await test('should export SCHEMAS object', () => {
      assert(safeJson.SCHEMAS !== undefined, 'SCHEMAS should be defined');
      assertEqual(typeof safeJson.SCHEMAS, 'object', 'SCHEMAS should be an object');
    });

    await test('should have router-state schema', () => {
      assert(
        safeJson.SCHEMAS['router-state'] !== undefined,
        'router-state schema should be defined'
      );
      assert(
        safeJson.SCHEMAS['router-state'].defaults !== undefined,
        'router-state defaults should be defined'
      );
    });

    await test('should have loop-state schema', () => {
      assert(safeJson.SCHEMAS['loop-state'] !== undefined, 'loop-state schema should be defined');
      assert(
        safeJson.SCHEMAS['loop-state'].defaults !== undefined,
        'loop-state defaults should be defined'
      );
    });
  });

  // SEC-AUDIT-015: evolution-state schema completeness tests
  await describe('evolution-state schema (SEC-AUDIT-015)', async () => {
    await test('should have evolution-state schema', () => {
      assert(
        safeJson.SCHEMAS['evolution-state'] !== undefined,
        'evolution-state schema should be defined'
      );
      assert(
        safeJson.SCHEMAS['evolution-state'].defaults !== undefined,
        'evolution-state defaults should be defined'
      );
    });

    await test('should include version field (matching evolution-state-sync.cjs DEFAULT_STATE)', () => {
      const defaults = safeJson.SCHEMAS['evolution-state'].defaults;
      assert(
        Object.prototype.hasOwnProperty.call(defaults, 'version'),
        'evolution-state schema should have version field'
      );
      assertEqual(defaults.version, '1.0.0', 'version should default to "1.0.0"');
    });

    await test('should include locks field (matching evolution-state-sync.cjs DEFAULT_STATE)', () => {
      const defaults = safeJson.SCHEMAS['evolution-state'].defaults;
      assert(
        Object.prototype.hasOwnProperty.call(defaults, 'locks'),
        'evolution-state schema should have locks field'
      );
      assertDeepEqual(defaults.locks, {}, 'locks should default to empty object');
    });

    await test('should NOT include spawnDepth field (belongs to loop-state, not evolution-state)', () => {
      const defaults = safeJson.SCHEMAS['evolution-state'].defaults;
      assert(
        !Object.prototype.hasOwnProperty.call(defaults, 'spawnDepth'),
        'evolution-state schema should NOT have spawnDepth field (it belongs to loop-state)'
      );
    });

    await test('should NOT include circuitBreaker field (not in evolution-state-sync.cjs DEFAULT_STATE)', () => {
      const defaults = safeJson.SCHEMAS['evolution-state'].defaults;
      assert(
        !Object.prototype.hasOwnProperty.call(defaults, 'circuitBreaker'),
        'evolution-state schema should NOT have circuitBreaker field'
      );
    });

    await test('should parse valid evolution-state JSON with all fields', () => {
      const content = JSON.stringify({
        version: '2.0.0',
        state: 'validating',
        currentEvolution: { type: 'agent', name: 'test' },
        evolutions: [{ type: 'skill', name: 'test-skill' }],
        patterns: [{ name: 'test-pattern' }],
        suggestions: [{ name: 'test-suggestion' }],
        lastUpdated: '2026-01-28T00:00:00.000Z',
        locks: { 'workflow-123': '2026-01-28T00:00:00.000Z' },
      });
      const result = safeJson.safeParseJSON(content, 'evolution-state');

      assertEqual(result.version, '2.0.0', 'version should be parsed');
      assertEqual(result.state, 'validating', 'state should be parsed');
      assertDeepEqual(
        result.locks,
        { 'workflow-123': '2026-01-28T00:00:00.000Z' },
        'locks should be parsed'
      );
    });

    await test('should return defaults for invalid evolution-state JSON', () => {
      const content = 'invalid json';
      const result = safeJson.safeParseJSON(content, 'evolution-state');

      assertEqual(result.version, '1.0.0', 'version should default to 1.0.0');
      assertEqual(result.state, 'idle', 'state should default to idle');
      assertDeepEqual(result.locks, {}, 'locks should default to empty object');
    });

    await test('should strip unknown properties from evolution-state', () => {
      const content = JSON.stringify({
        state: 'idle',
        malicious: 'payload',
        spawnDepth: 5, // This should be stripped (wrong schema)
        circuitBreaker: {}, // This should be stripped (wrong schema)
      });
      const result = safeJson.safeParseJSON(content, 'evolution-state');

      assertEqual(result.state, 'idle', 'state should be parsed');
      assertEqual(result.malicious, undefined, 'malicious should be stripped');
      assertEqual(result.spawnDepth, undefined, 'spawnDepth should be stripped');
      assertEqual(result.circuitBreaker, undefined, 'circuitBreaker should be stripped');
    });
  });

  // Summary
  console.log('\n=========================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
