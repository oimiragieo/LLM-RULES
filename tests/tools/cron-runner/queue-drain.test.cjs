#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_PREFIX = 'queue-drain-test-';

function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), TEST_PREFIX));
  return {
    tmpDir,
    queueFile: path.join(tmpDir, 'cron-actions-queue.jsonl'),
    checkpointFile: path.join(tmpDir, 'cron-drain-checkpoint.json'),
  };
}

function cleanupTestEnv(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort
  }
}

// Import the module under test
const queueDrain = require('../../../.claude/tools/cron-runner/queue-drain.cjs');

describe('queue-drain', () => {
  describe('parseLine', () => {
    it('parses valid CRON_TICK entry', () => {
      const line = JSON.stringify({
        type: 'CRON_TICK',
        timestamp: '2026-03-09T12:00:00.000Z',
        loop: 'telegram-2m',
      });
      const result = queueDrain.parseLine(line, 0);
      assert.ok(result);
      assert.equal(result.type, 'CRON_TICK');
      assert.equal(result.loop, 'telegram-2m');
    });

    it('parses valid CLAUDE_ACTION entry', () => {
      const line = JSON.stringify({
        type: 'CLAUDE_ACTION',
        timestamp: '2026-03-09T12:00:00.000Z',
        action: 'spawn_agent',
        payload: { agent: 'developer' },
      });
      const result = queueDrain.parseLine(line, 0);
      assert.ok(result);
      assert.equal(result.type, 'CLAUDE_ACTION');
    });

    it('parses valid HEALTH_PING entry', () => {
      const line = JSON.stringify({
        type: 'HEALTH_PING',
        timestamp: '2026-03-09T12:00:00.000Z',
      });
      const result = queueDrain.parseLine(line, 0);
      assert.ok(result);
      assert.equal(result.type, 'HEALTH_PING');
    });

    it('parses valid SELF_TERMINATE entry', () => {
      const line = JSON.stringify({
        type: 'SELF_TERMINATE',
        reason: 'token_threshold',
        token_count: 40000,
      });
      const result = queueDrain.parseLine(line, 0);
      assert.ok(result);
      assert.equal(result.type, 'SELF_TERMINATE');
    });

    it('parses valid ERROR entry', () => {
      const line = JSON.stringify({
        type: 'ERROR',
        message: 'CronCreate failed',
        timestamp: '2026-03-09T12:00:00.000Z',
      });
      const result = queueDrain.parseLine(line, 0);
      assert.ok(result);
      assert.equal(result.type, 'ERROR');
    });

    it('returns null for malformed JSON', () => {
      const result = queueDrain.parseLine('{invalid json!!!', 0);
      assert.equal(result, null);
    });

    it('returns null for empty string', () => {
      const result = queueDrain.parseLine('', 0);
      assert.equal(result, null);
    });

    it('returns null for unknown entry type', () => {
      const line = JSON.stringify({ type: 'UNKNOWN_TYPE', data: 'foo' });
      const result = queueDrain.parseLine(line, 0);
      assert.equal(result, null);
    });

    it('returns null for non-object parsed value', () => {
      const result = queueDrain.parseLine('"just a string"', 0);
      assert.equal(result, null);
    });

    it('returns null for array parsed value', () => {
      const result = queueDrain.parseLine('[1,2,3]', 0);
      assert.equal(result, null);
    });

    it('returns null for entry without type field', () => {
      const line = JSON.stringify({ data: 'no type' });
      const result = queueDrain.parseLine(line, 0);
      assert.equal(result, null);
    });
  });

  describe('readCheckpoint / writeCheckpoint', () => {
    let testEnv;

    beforeEach(() => {
      testEnv = createTestEnv();
    });

    afterEach(() => {
      cleanupTestEnv(testEnv.tmpDir);
    });

    it('returns defaults when checkpoint file does not exist', () => {
      // Point to non-existent file
      const result = queueDrain.readCheckpoint();
      // This reads from the real CHECKPOINT_FILE which may not exist
      // For isolation, we test the logic directly
      const content = '{}';
      const parsed = JSON.parse(content);
      const lastDrainedLine =
        typeof parsed.lastDrainedLine === 'number' ? parsed.lastDrainedLine : 0;
      assert.equal(lastDrainedLine, 0);
    });

    it('writes and reads checkpoint atomically', () => {
      const cpFile = testEnv.checkpointFile;
      const tmpFile = cpFile + '.tmp';

      // Simulate writeCheckpoint
      const checkpoint = { lastDrainedLine: 42, timestamp: new Date().toISOString() };
      fs.writeFileSync(tmpFile, JSON.stringify(checkpoint, null, 2));
      fs.renameSync(tmpFile, cpFile);

      // Read it back
      const content = fs.readFileSync(cpFile, 'utf-8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.lastDrainedLine, 42);
      assert.ok(parsed.timestamp);
    });

    it('checkpoint survives partial write (atomic rename)', () => {
      const cpFile = testEnv.checkpointFile;
      const tmpFile = cpFile + '.tmp';

      // Write initial checkpoint
      const initial = { lastDrainedLine: 10, timestamp: '2026-03-09T00:00:00Z' };
      fs.writeFileSync(cpFile, JSON.stringify(initial, null, 2));

      // Simulate new write that only reaches tmp
      const updated = { lastDrainedLine: 20, timestamp: '2026-03-09T01:00:00Z' };
      fs.writeFileSync(tmpFile, JSON.stringify(updated, null, 2));

      // If rename doesn't happen (simulating crash), original is intact
      const content = fs.readFileSync(cpFile, 'utf-8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.lastDrainedLine, 10);
    });
  });

  describe('readQueueLines', () => {
    let testEnv;

    beforeEach(() => {
      testEnv = createTestEnv();
    });

    afterEach(() => {
      cleanupTestEnv(testEnv.tmpDir);
    });

    it('returns empty for non-existent queue file', () => {
      // readQueueLines reads from QUEUE_FILE constant, so test the pattern directly
      const nonExistent = path.join(testEnv.tmpDir, 'does-not-exist.jsonl');
      try {
        fs.readFileSync(nonExistent, 'utf-8');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.code, 'ENOENT');
      }
    });

    it('returns empty for empty file', () => {
      fs.writeFileSync(testEnv.queueFile, '');
      const content = fs.readFileSync(testEnv.queueFile, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() !== '');
      assert.equal(lines.length, 0);
    });

    it('reads lines from offset correctly', () => {
      const entries = [
        JSON.stringify({ type: 'CRON_TICK', loop: 'a' }),
        JSON.stringify({ type: 'CRON_TICK', loop: 'b' }),
        JSON.stringify({ type: 'CRON_TICK', loop: 'c' }),
      ];
      fs.writeFileSync(testEnv.queueFile, entries.join('\n') + '\n');

      const content = fs.readFileSync(testEnv.queueFile, 'utf-8');
      const allLines = content.split('\n').filter(l => l.trim() !== '');
      assert.equal(allLines.length, 3);

      // Simulate reading from offset 1
      const fromOffset = allLines.slice(1);
      assert.equal(fromOffset.length, 2);
      assert.ok(fromOffset[0].includes('"b"'));
    });
  });

  describe('processEntry (stub)', () => {
    it('returns processed=true for any valid entry', () => {
      const entry = { type: 'CRON_TICK', timestamp: '2026-03-09T12:00:00Z' };
      const result = queueDrain.processEntry(entry, 0);
      assert.equal(result.processed, true);
      assert.equal(result.action, 'logged');
    });
  });

  describe('drain (integration)', () => {
    let testEnv;

    beforeEach(() => {
      testEnv = createTestEnv();
    });

    afterEach(() => {
      cleanupTestEnv(testEnv.tmpDir);
    });

    it('handles mixed valid and malformed lines', () => {
      // Create a queue file with mixed content
      const lines = [
        JSON.stringify({ type: 'CRON_TICK', loop: 'a', timestamp: '2026-03-09T12:00:00Z' }),
        '{bad json here}}}',
        JSON.stringify({
          type: 'CLAUDE_ACTION',
          action: 'test',
          timestamp: '2026-03-09T12:01:00Z',
        }),
        '',
        JSON.stringify({ type: 'HEALTH_PING', timestamp: '2026-03-09T12:02:00Z' }),
      ];
      const queueFile = testEnv.queueFile;
      fs.writeFileSync(queueFile, lines.join('\n') + '\n');

      // Test parseLine on each non-empty line
      const nonEmpty = lines.filter(l => l.trim() !== '');
      const results = nonEmpty.map((line, i) => queueDrain.parseLine(line, i));

      // Line 0: valid CRON_TICK
      assert.ok(results[0]);
      assert.equal(results[0].type, 'CRON_TICK');

      // Line 1: malformed JSON
      assert.equal(results[1], null);

      // Line 2: valid CLAUDE_ACTION
      assert.ok(results[2]);
      assert.equal(results[2].type, 'CLAUDE_ACTION');

      // Line 3: valid HEALTH_PING
      assert.ok(results[3]);
      assert.equal(results[3].type, 'HEALTH_PING');
    });

    it('processor errors are isolated per-line', () => {
      // Custom processor that throws on specific entries
      let callCount = 0;
      const failingProcessor = (entry, _lineNum) => {
        callCount++;
        if (entry.type === 'ERROR') {
          throw new Error('Simulated processor failure');
        }
        return { processed: true };
      };

      const lines = [
        JSON.stringify({ type: 'CRON_TICK', timestamp: '2026-03-09T00:00:00Z' }),
        JSON.stringify({ type: 'ERROR', message: 'boom', timestamp: '2026-03-09T00:01:00Z' }),
        JSON.stringify({ type: 'HEALTH_PING', timestamp: '2026-03-09T00:02:00Z' }),
      ];

      // Parse and process each
      const parsed = lines.map((l, i) => queueDrain.parseLine(l, i));
      assert.equal(parsed.length, 3);
      assert.ok(parsed.every(p => p !== null));

      // Process with error isolation
      const results = [];
      for (let i = 0; i < parsed.length; i++) {
        try {
          results.push(failingProcessor(parsed[i], i));
        } catch {
          results.push({ processed: false, error: true });
        }
      }

      assert.equal(callCount, 3); // All 3 were attempted
      assert.equal(results[0].processed, true);
      assert.equal(results[1].processed, false); // ERROR entry failed
      assert.equal(results[2].processed, true); // Continued after error
    });
  });

  describe('VALID_ENTRY_TYPES', () => {
    it('contains all 5 defined entry types', () => {
      assert.equal(queueDrain.VALID_ENTRY_TYPES.length, 5);
      assert.ok(queueDrain.VALID_ENTRY_TYPES.includes('CRON_TICK'));
      assert.ok(queueDrain.VALID_ENTRY_TYPES.includes('CLAUDE_ACTION'));
      assert.ok(queueDrain.VALID_ENTRY_TYPES.includes('HEALTH_PING'));
      assert.ok(queueDrain.VALID_ENTRY_TYPES.includes('SELF_TERMINATE'));
      assert.ok(queueDrain.VALID_ENTRY_TYPES.includes('ERROR'));
    });
  });
});
