#!/usr/bin/env node
/**
 * Tests for Flight Recorder (Phase 2)
 * 
 * Verifies that the flight recorder:
 * 1. Appends events in JSONL format.
 * 2. Is resilient to write failures (fail-open).
 * 3. Enforces a basic schema.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// We'll create the module during the "Green" phase, so this test might fail to load initially.
let recorder;
const TEST_LOG = path.join(PROJECT_ROOT, '.claude', 'tmp', 'flight-recorder-test.jsonl');

async function testRecorder() {
  console.log('Flight Recorder Tests');
  console.log('=====================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  try {
    recorder = require('../../../.claude/lib/monitoring/flight-recorder.cjs');
  } catch (_err) {
    console.log('Recorder module not found - expected in RED phase');
  }

  if (fs.existsSync(TEST_LOG)) fs.unlinkSync(TEST_LOG);

  await test('should append valid events to JSONL', async () => {
    if (!recorder) throw new Error('Recorder not loaded');
    
    recorder.record({
      event: 'test_event',
      traceId: 'trace-1',
      component: 'test',
      data: { foo: 'bar' }
    }, TEST_LOG);

    const content = fs.readFileSync(TEST_LOG, 'utf8').trim();
    const parsed = JSON.parse(content);
    if (parsed.event !== 'test_event') throw new Error('Data mismatch');
    if (!parsed.timestamp) throw new Error('Missing timestamp');
  });

  await test('should be resilient to write failures (fail-open)', async () => {
    if (!recorder) throw new Error('Recorder not loaded');
    
    // Simulate read-only directory or invalid path
    const invalidPath = path.join('/invalid/path/to/logs.jsonl');
    
    // This should NOT throw
    recorder.record({ event: 'fail_open_test' }, invalidPath);
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testRecorder();
