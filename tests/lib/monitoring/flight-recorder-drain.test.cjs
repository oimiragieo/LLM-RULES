#!/usr/bin/env node
/**
 * Test: Flight Recorder Final Drain (TDD 2.1)
 *
 * Verifies that all telemetry events are flushed to disk even when the process exits.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const TEST_LOG = path.join(PROJECT_ROOT, '.claude', 'tmp', 'final-drain-test.jsonl');
const TEST_SCRIPT = path.join(PROJECT_ROOT, '.claude', 'tmp', 'exit-test-script.cjs');

async function runTest() {
  console.log('--- Telemetry Final Drain Test ---');

  if (fs.existsSync(TEST_LOG)) fs.unlinkSync(TEST_LOG);
  if (!fs.existsSync(path.dirname(TEST_LOG)))
    fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });

  const safeLogPath = TEST_LOG.split(path.sep).join('/');

  // 1. Create a script that records events and exits
  const scriptContent = `
    const { record } = require('../lib/monitoring/flight-recorder.cjs');
    record({ event: 'event_1' }, '${safeLogPath}');
    record({ event: 'event_2' }, '${safeLogPath}');
    record({ event: 'event_3' }, '${safeLogPath}');
    process.exit(0);
  `;
  fs.writeFileSync(TEST_SCRIPT, scriptContent);

  // 2. Run the script
  console.log('Running exit-test-script...');
  const child = spawn(process.execPath, [TEST_SCRIPT], { stdio: 'inherit' });
  await new Promise(r => child.on('close', r));

  // 3. Verify logs
  if (!fs.existsSync(TEST_LOG)) {
    console.error('\n[FAIL] Log file was never created.');
    process.exit(1);
  }

  const lines = fs.readFileSync(TEST_LOG, 'utf8').trim().split('\n').filter(Boolean);
  console.log(`Events recorded: ${lines.length}`);

  if (lines.length === 3) {
    console.log('\n[PASS] All events flushed before exit.');
    process.exit(0);
  } else {
    console.error(`\n[FAIL] Data loss detected. Expected 3 events, got ${lines.length}.`);
    process.exit(1);
  }
}

runTest();
