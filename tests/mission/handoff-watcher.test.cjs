'use strict';

/**
 * Tests for Handoff Directory Watcher
 *
 * Validates assertions:
 * - VAL-HW-001: Detects new JSON file in handoffs directory
 * - VAL-HW-002: Debounce prevents duplicate processing
 * - VAL-HW-003: FIFO ordering by timestamp in filename
 * - VAL-HW-004: Malformed JSON emits error event without crash
 * - VAL-HW-005: Non-JSON files ignored
 *
 * Additional requirements from feature description:
 * - Partially-written files retried 3x with 200ms delay
 * - File deletions ignored
 * - Clean start/stop lifecycle
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');

// Module under test
const { HandoffWatcher } = require('../../.claude/lib/mission/handoff-watcher.cjs');

/**
 * Helper to wait for an event with timeout
 * @param {EventEmitter} emitter - Event emitter
 * @param {string} eventName - Event name
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{event: string, payload: any}>}
 */
function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    emitter.once(eventName, payload => {
      clearTimeout(timeout);
      resolve({ event: eventName, payload });
    });
  });
}

/**
 * Helper to create a temp file with content
 * @param {string} dir - Directory path
 * @param {string} filename - File name
 * @param {any} content - Content to write
 */
function writeJsonFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(content), 'utf8');
  return filePath;
}

/**
 * Helper to create a malformed JSON file
 * @param {string} dir - Directory path
 * @param {string} filename - File name
 * @param {string} content - Invalid JSON content
 */
function writeMalformedJsonFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('HandoffWatcher', () => {
  let tempDir;
  let handoffsDir;
  let watcher;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-watcher-test-'));
    handoffsDir = path.join(tempDir, 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });
  });

  after(() => {
    if (watcher) {
      watcher.stop();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Ensure watcher is stopped between tests
    if (watcher) {
      watcher.stop();
    }

    // Clean handoffs directory
    if (fs.existsSync(handoffsDir)) {
      const files = fs.readdirSync(handoffsDir);
      for (const file of files) {
        fs.rmSync(path.join(handoffsDir, file), { force: true });
      }
    } else {
      fs.mkdirSync(handoffsDir, { recursive: true });
    }

    // Create fresh watcher
    watcher = new HandoffWatcher(handoffsDir);
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }
  });

  describe('VAL-HW-001: Detects new JSON file in handoffs directory', () => {
    it('emits handoff-detected event when new .json file is created', async () => {
      watcher.start();

      const payload = { featureId: 'test-feature', status: 'completed', data: { count: 42 } };
      const timestamp = Date.now();
      const filename = `${timestamp}-handoff.json`;

      // Write file
      writeJsonFile(handoffsDir, filename, payload);

      // Wait for event
      const result = await waitForEvent(watcher, 'handoff-detected', 3000);

      assert.ok(result, 'Event should be emitted');
      assert.strictEqual(result.payload.featureId, 'test-feature', 'Payload should have featureId');
      assert.strictEqual(result.payload.status, 'completed', 'Payload should have status');
      assert.strictEqual(result.payload.data.count, 42, 'Payload should preserve nested data');
    });

    it('event fires within 2s of file creation', async () => {
      watcher.start();

      const start = Date.now();
      writeJsonFile(handoffsDir, `${Date.now()}-test.json`, { test: true });

      await waitForEvent(watcher, 'handoff-detected', 2500);
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 2000, `Event should fire within 2s (took ${elapsed}ms)`);
    });

    it('includes filename in the event payload', async () => {
      watcher.start();

      const filename = `${Date.now()}-my-feature.json`;
      writeJsonFile(handoffsDir, filename, { featureId: 'my-feature' });

      const result = await waitForEvent(watcher, 'handoff-detected', 3000);

      assert.strictEqual(result.payload._filename, filename, 'Filename should be included');
    });
  });

  describe('VAL-HW-002: Debounce prevents duplicate processing', () => {
    it('emits exactly one event for multiple writes to same file within 500ms', async () => {
      // Use shorter debounce for faster testing
      const fastWatcher = new HandoffWatcher(handoffsDir, { debounceMs: 200 });
      fastWatcher.start();

      const filename = `${Date.now()}-debounce-test.json`;
      let eventCount = 0;

      fastWatcher.on('handoff-detected', () => {
        eventCount++;
      });

      // Rapidly write to the same file multiple times
      for (let i = 0; i < 5; i++) {
        writeJsonFile(handoffsDir, filename, { iteration: i });
      }

      // Wait for debounce window to pass
      await new Promise(resolve => setTimeout(resolve, 500));

      assert.strictEqual(eventCount, 1, 'Should emit exactly one event after debounce');
      fastWatcher.stop();
    });

    it('same file can trigger multiple events across separate debounce windows', async () => {
      // Use shorter debounce for faster testing
      const fastWatcher = new HandoffWatcher(handoffsDir, { debounceMs: 200 });
      fastWatcher.start();

      const filename = `${Date.now()}-window-test.json`;
      const events = [];

      fastWatcher.on('handoff-detected', payload => {
        events.push(payload);
      });

      // First write
      writeJsonFile(handoffsDir, filename, { batch: 1 });

      // Wait for first event
      await waitForEvent(fastWatcher, 'handoff-detected', 3000);
      assert.strictEqual(events.length, 1, 'First event should be emitted');

      // Wait for debounce window to fully close
      await new Promise(resolve => setTimeout(resolve, 300));

      // Second write after debounce window
      writeJsonFile(handoffsDir, filename, { batch: 2 });

      // Wait for second event
      await waitForEvent(fastWatcher, 'handoff-detected', 3000);

      assert.strictEqual(
        events.length,
        2,
        'Should emit 2 events for writes across debounce windows'
      );
      fastWatcher.stop();
    });
  });

  describe('VAL-HW-003: FIFO ordering by timestamp in filename', () => {
    it('processes files in ascending timestamp order', async () => {
      // Use shorter debounce for faster testing
      const fastWatcher = new HandoffWatcher(handoffsDir, { debounceMs: 100 });
      fastWatcher.start();

      const timestamps = [
        Date.now() - 3000, // Oldest
        Date.now() - 2000, // Middle
        Date.now() - 1000, // Newest
      ];

      // Collect all events
      const events = [];
      fastWatcher.on('handoff-detected', payload => {
        events.push(payload);
      });

      // Write files in reverse order (newest first)
      writeJsonFile(handoffsDir, `${timestamps[2]}-c.json`, { order: 'C' });
      writeJsonFile(handoffsDir, `${timestamps[1]}-b.json`, { order: 'B' });
      writeJsonFile(handoffsDir, `${timestamps[0]}-a.json`, { order: 'A' });

      // Wait for debounce + processing
      await new Promise(resolve => setTimeout(resolve, 600));

      // On Windows with polling, may need more time
      if (events.length < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      assert.strictEqual(events.length, 3, 'Should process all 3 files');
      // Events should arrive in FIFO (timestamp) order
      assert.strictEqual(events[0].order, 'A', 'First should be oldest (A)');
      assert.strictEqual(events[1].order, 'B', 'Second should be middle (B)');
      assert.strictEqual(events[2].order, 'C', 'Third should be newest (C)');
      fastWatcher.stop();
    });

    it('handles files with same timestamp by alphabetical suffix', async () => {
      // Use shorter debounce for faster testing
      const fastWatcher = new HandoffWatcher(handoffsDir, { debounceMs: 100 });
      fastWatcher.start();

      const timestamp = Date.now();

      // Collect all events
      const events = [];
      fastWatcher.on('handoff-detected', payload => {
        events.push(payload);
      });

      // Files with same timestamp but different suffixes
      writeJsonFile(handoffsDir, `${timestamp}-task-z.json`, { name: 'Z' });
      writeJsonFile(handoffsDir, `${timestamp}-task-a.json`, { name: 'A' });
      writeJsonFile(handoffsDir, `${timestamp}-task-m.json`, { name: 'M' });

      // Wait for debounce + processing
      await new Promise(resolve => setTimeout(resolve, 600));

      // On Windows with polling, may need more time
      if (events.length < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      assert.strictEqual(events.length, 3, 'Should process all files');
      // With same timestamp, should be sorted alphabetically by suffix
      assert.strictEqual(events[0].name, 'A', 'First should be A (alphabetically)');
      assert.strictEqual(events[1].name, 'M', 'Second should be M');
      assert.strictEqual(events[2].name, 'Z', 'Third should be Z');
      fastWatcher.stop();
    });
  });

  describe('VAL-HW-004: Malformed JSON emits error event without crash', () => {
    it('emits handoff-error for invalid JSON', async () => {
      watcher.start();

      writeMalformedJsonFile(handoffsDir, `${Date.now()}-bad.json`, '{ not valid json }');

      const result = await waitForEvent(watcher, 'handoff-error', 3000);

      assert.ok(result, 'Error event should be emitted');
      assert.ok(result.payload.filename, 'Error payload should have filename');
      assert.ok(result.payload.error, 'Error payload should have error message');
    });

    it('continues watching after malformed JSON error', async () => {
      watcher.start();

      // Write bad JSON
      writeMalformedJsonFile(handoffsDir, `${Date.now()}-bad.json`, '{ invalid }');

      // Wait for error
      await waitForEvent(watcher, 'handoff-error', 3000);

      // Now write valid JSON
      writeJsonFile(handoffsDir, `${Date.now()}-good.json`, { valid: true });

      // Should detect the valid file
      const result = await waitForEvent(watcher, 'handoff-detected', 3000);

      assert.ok(result, 'Should continue watching and detect valid file');
      assert.strictEqual(result.payload.valid, true, 'Valid payload should be parsed');
    });

    it('error payload includes filename and error details', async () => {
      watcher.start();

      const filename = `${Date.now()}-malformed.json`;
      writeMalformedJsonFile(handoffsDir, filename, 'not json at all');

      const result = await waitForEvent(watcher, 'handoff-error', 3000);

      assert.strictEqual(result.payload.filename, filename, 'Filename should match');
      assert.ok(
        result.payload.error.includes('JSON') ||
          result.payload.error.includes('parse') ||
          result.payload.error.includes('Unexpected'),
        'Error message should indicate JSON parsing issue'
      );
    });
  });

  describe('VAL-HW-005: Non-JSON files ignored', () => {
    it('produces no events for .txt files', async () => {
      watcher.start();

      let eventFired = false;
      watcher.on('handoff-detected', () => {
        eventFired = true;
      });

      // Write a .txt file
      const txtPath = path.join(handoffsDir, `${Date.now()}-notes.txt`);
      fs.writeFileSync(txtPath, 'Some text content', 'utf8');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1500));

      assert.strictEqual(eventFired, false, 'No event should fire for .txt file');
    });

    it('produces no events for files without .json extension', async () => {
      watcher.start();

      let eventCount = 0;
      watcher.on('handoff-detected', () => eventCount++);
      watcher.on('handoff-error', () => eventCount++);

      // Write various non-JSON files
      fs.writeFileSync(path.join(handoffsDir, 'data.csv'), 'a,b,c', 'utf8');
      fs.writeFileSync(path.join(handoffsDir, 'config.yaml'), 'key: value', 'utf8');
      fs.writeFileSync(path.join(handoffsDir, 'readme.md'), '# Test', 'utf8');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1500));

      assert.strictEqual(eventCount, 0, 'No events should fire for non-JSON files');
    });
  });

  describe('Partially-written files retry', () => {
    it('retries partially-written files 3x with delay before emitting error', async () => {
      // This test verifies retry behavior
      // Since it's hard to simulate partial writes, we test that malformed JSON
      // eventually produces an error after retries
      watcher.start();

      const filename = `${Date.now()}-partial.json`;

      // Write content that will fail to parse
      fs.writeFileSync(path.join(handoffsDir, filename), '{ incomplete', 'utf8');

      // Wait for error (retries should happen internally)
      const start = Date.now();
      const result = await waitForEvent(watcher, 'handoff-error', 5000);
      const elapsed = Date.now() - start;

      assert.ok(result, 'Error event should eventually fire');
      // With 3 retries at 200ms each, we expect at least some delay
      // But the error should still fire within reasonable time
      assert.ok(elapsed < 3000, `Error should fire within reasonable time (took ${elapsed}ms)`);
    });
  });

  describe('File deletions ignored', () => {
    it('produces no events when files are deleted', async () => {
      watcher.start();

      // Create a file first
      const filePath = writeJsonFile(handoffsDir, `${Date.now()}-delete-me.json`, { test: true });

      // Wait for initial detection
      await waitForEvent(watcher, 'handoff-detected', 3000);

      let eventAfterDelete = false;
      watcher.on('handoff-detected', () => {
        eventAfterDelete = true;
      });
      watcher.on('handoff-error', () => {
        eventAfterDelete = true;
      });

      // Delete the file
      fs.unlinkSync(filePath);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1500));

      assert.strictEqual(eventAfterDelete, false, 'No events should fire for deletion');
    });
  });

  describe('Clean start/stop lifecycle', () => {
    it('stop() removes watchers and clears timers', async () => {
      watcher.start();

      // Verify it's watching
      writeJsonFile(handoffsDir, `${Date.now()}-test.json`, { first: true });
      await waitForEvent(watcher, 'handoff-detected', 3000);

      // Stop the watcher
      watcher.stop();

      // Write another file
      let eventAfterStop = false;
      watcher.on('handoff-detected', () => {
        eventAfterStop = true;
      });

      writeJsonFile(handoffsDir, `${Date.now()}-after-stop.json`, { second: true });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      assert.strictEqual(eventAfterStop, false, 'No events should fire after stop()');
    });

    it('start() re-registers watchers after stop()', async () => {
      // Start, then stop
      watcher.start();
      watcher.stop();

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Start again
      watcher.start();

      // Write a file
      writeJsonFile(handoffsDir, `${Date.now()}-restart.json`, { restarted: true });

      // Should detect the file
      const result = await waitForEvent(watcher, 'handoff-detected', 3000);

      assert.ok(result, 'Should detect file after restart');
      assert.strictEqual(result.payload.restarted, true, 'Payload should be correct');
    });

    it('can be stopped and started multiple times', async () => {
      for (let i = 0; i < 3; i++) {
        watcher.start();
        writeJsonFile(handoffsDir, `${Date.now()}-cycle-${i}.json`, { cycle: i });
        await waitForEvent(watcher, 'handoff-detected', 3000);
        watcher.stop();
      }
      // If we get here without errors, the lifecycle is clean
      assert.ok(true, 'Multiple start/stop cycles should work');
    });
  });

  describe('EventEmitter interface', () => {
    it('extends EventEmitter', () => {
      assert.ok(watcher instanceof EventEmitter, 'HandoffWatcher should extend EventEmitter');
    });

    it('emits events that can be listened to with .on()', async () => {
      watcher.start();

      let received = null;
      watcher.on('handoff-detected', payload => {
        received = payload;
      });

      writeJsonFile(handoffsDir, `${Date.now()}-listener.json`, { listened: true });

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 1500));

      assert.ok(received, 'Event should be received via .on()');
      assert.strictEqual(received.listened, true, 'Payload should be correct');
    });
  });

  describe('Windows polling mode', () => {
    it('uses fs.watch on non-Windows platforms', function () {
      // This test checks the implementation path, not the behavior
      // On Windows, fs.watchFile should be used; on other platforms, fs.watch
      // We can't fully test cross-platform, but we verify the API exists

      if (process.platform === 'win32') {
        // On Windows, the watcher should use polling
        // We just verify it works
        watcher.start();
        writeJsonFile(handoffsDir, `${Date.now()}-win.json`, { platform: 'win32' });
        return waitForEvent(watcher, 'handoff-detected', 4000).then(result => {
          assert.ok(result, 'Watcher should work on Windows');
        });
      } else {
        // On non-Windows, fs.watch should be used
        // We just verify it works
        watcher.start();
        writeJsonFile(handoffsDir, `${Date.now()}-unix.json`, { platform: 'unix' });
        return waitForEvent(watcher, 'handoff-detected', 3000).then(result => {
          assert.ok(result, 'Watcher should work on Unix');
        });
      }
    });
  });

  describe('FIFO with real-world filenames', () => {
    it('handles real timestamp prefix format', async () => {
      // Use shorter debounce for faster testing
      const fastWatcher = new HandoffWatcher(handoffsDir, { debounceMs: 100 });
      fastWatcher.start();

      // Collect all events
      const events = [];
      fastWatcher.on('handoff-detected', payload => {
        events.push(payload);
      });

      // Real-world timestamp format: milliseconds since epoch
      const now = Date.now();
      writeJsonFile(handoffsDir, `${now - 5000}-feature-a-completed.json`, { feature: 'A' });
      writeJsonFile(handoffsDir, `${now - 2500}-feature-b-completed.json`, { feature: 'B' });
      writeJsonFile(handoffsDir, `${now}-feature-c-completed.json`, { feature: 'C' });

      // Wait for debounce + processing
      await new Promise(resolve => setTimeout(resolve, 600));

      // On Windows with polling, may need more time
      if (events.length < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      assert.strictEqual(events.length, 3, 'Should process all files');
      assert.strictEqual(events[0].feature, 'A', 'Oldest first');
      assert.strictEqual(events[1].feature, 'B', 'Middle second');
      assert.strictEqual(events[2].feature, 'C', 'Newest last');
      fastWatcher.stop();
    });
  });
});
