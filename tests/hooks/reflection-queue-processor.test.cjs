#!/usr/bin/env node
/**
 * Tests for reflection-queue-processor.cjs
 *
 * Tests the queue processor that reads pending reflection entries
 * and outputs spawn instructions for the reflection-agent.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test file path
const PROCESSOR_PATH = path.join(__dirname, 'reflection-queue-processor.cjs');

// Helper to create a temporary test directory
function createTestDir() {
  const testDir = path.join(os.tmpdir(), `reflection-queue-test-${Date.now()}`);
  const contextDir = path.join(testDir, '.claude', 'context');
  fs.mkdirSync(contextDir, { recursive: true });
  return testDir;
}

// Helper to cleanup test directory
function cleanupTestDir(testDir) {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

describe('reflection-queue-processor', () => {
  let testDir;
  let processor;
  let originalQueueFile;

  beforeEach(() => {
    testDir = createTestDir();
    // Clear require cache to get fresh module
    delete require.cache[require.resolve(PROCESSOR_PATH)];
    processor = require(PROCESSOR_PATH);
    originalQueueFile = processor.QUEUE_FILE;
    processor.QUEUE_FILE = path.join(testDir, '.claude', 'context', 'reflection-queue.jsonl');
  });

  afterEach(() => {
    processor.QUEUE_FILE = originalQueueFile;
    cleanupTestDir(testDir);
  });

  describe('isEnabled', () => {
    it('should be enabled by default', () => {
      delete process.env.REFLECTION_ENABLED;
      delete process.env.REFLECTION_HOOK_MODE;
      assert.strictEqual(processor.isEnabled(), true);
    });

    it('should be disabled when REFLECTION_ENABLED=false', () => {
      process.env.REFLECTION_ENABLED = 'false';
      assert.strictEqual(processor.isEnabled(), false);
      delete process.env.REFLECTION_ENABLED;
    });

    it('should be disabled when REFLECTION_HOOK_MODE=off', () => {
      process.env.REFLECTION_HOOK_MODE = 'off';
      assert.strictEqual(processor.isEnabled(), false);
      delete process.env.REFLECTION_HOOK_MODE;
    });
  });

  describe('readQueueEntries', () => {
    it('should return empty array for missing queue file', () => {
      const entries = processor.readQueueEntries(processor.QUEUE_FILE);
      assert.deepStrictEqual(entries, []);
    });

    it('should return empty array for empty queue file', () => {
      fs.writeFileSync(processor.QUEUE_FILE, '');
      const entries = processor.readQueueEntries(processor.QUEUE_FILE);
      assert.deepStrictEqual(entries, []);
    });

    it('should parse valid JSONL entries', () => {
      const entry1 = {
        taskId: '1',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:00:00Z',
        priority: 'high',
      };
      const entry2 = {
        context: 'session_end',
        trigger: 'session_end',
        timestamp: '2026-01-26T10:05:00Z',
        priority: 'low',
      };
      fs.writeFileSync(
        processor.QUEUE_FILE,
        JSON.stringify(entry1) + '\n' + JSON.stringify(entry2) + '\n'
      );

      const entries = processor.readQueueEntries(processor.QUEUE_FILE);
      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0].taskId, '1');
      assert.strictEqual(entries[1].context, 'session_end');
    });

    it('should skip malformed JSON lines', () => {
      const validEntry = {
        taskId: '1',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:00:00Z',
      };
      fs.writeFileSync(
        processor.QUEUE_FILE,
        'invalid json\n' + JSON.stringify(validEntry) + '\n{broken\n'
      );

      const entries = processor.readQueueEntries(processor.QUEUE_FILE);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].taskId, '1');
    });

    it('should skip entries marked as processed', () => {
      const unprocessed = {
        taskId: '1',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:00:00Z',
      };
      const processed = {
        taskId: '2',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:05:00Z',
        processed: true,
      };
      fs.writeFileSync(
        processor.QUEUE_FILE,
        JSON.stringify(unprocessed) + '\n' + JSON.stringify(processed) + '\n'
      );

      const entries = processor.readQueueEntries(processor.QUEUE_FILE);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].taskId, '1');
    });
  });

  describe('getPendingEntries', () => {
    it('should filter out processed entries', () => {
      const entries = [
        { taskId: '1', processed: false },
        { taskId: '2', processed: true },
        { taskId: '3' }, // no processed field = not processed
      ];
      const pending = processor.getPendingEntries(entries);
      assert.strictEqual(pending.length, 2);
      assert.strictEqual(pending[0].taskId, '1');
      assert.strictEqual(pending[1].taskId, '3');
    });
  });

  describe('generateSpawnInstruction', () => {
    it('should generate spawn instruction for task_completion trigger', () => {
      const entry = {
        taskId: '42',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:00:00Z',
        priority: 'high',
      };
      const instruction = processor.generateSpawnInstruction(entry);

      assert.ok(instruction.includes('[REFLECTION-TRIGGER]'));
      assert.ok(instruction.includes('task_completion'));
      assert.ok(instruction.includes('Task('));
      assert.ok(instruction.includes('reflection-agent'));
    });

    it('should generate spawn instruction for session_end trigger', () => {
      const entry = {
        context: 'session_end',
        trigger: 'session_end',
        timestamp: '2026-01-26T10:00:00Z',
        priority: 'low',
      };
      const instruction = processor.generateSpawnInstruction(entry);

      assert.ok(instruction.includes('[REFLECTION-TRIGGER]'));
      assert.ok(instruction.includes('session_end'));
      assert.ok(instruction.includes('Task('));
    });

    it('should generate spawn instruction for error_recovery trigger', () => {
      const entry = {
        context: 'error_recovery',
        trigger: 'error',
        tool: 'Bash',
        error: 'exit code 1',
        timestamp: '2026-01-26T10:00:00Z',
      };
      const instruction = processor.generateSpawnInstruction(entry);

      assert.ok(instruction.includes('[REFLECTION-TRIGGER]'));
      assert.ok(instruction.includes('error'));
    });
  });

  describe('markEntriesProcessed', () => {
    it('should mark entries as processed in the queue file', () => {
      const entry1 = { taskId: '1', trigger: 'task_completion', timestamp: '2026-01-26T10:00:00Z' };
      const entry2 = { taskId: '2', trigger: 'task_completion', timestamp: '2026-01-26T10:05:00Z' };
      fs.writeFileSync(
        processor.QUEUE_FILE,
        JSON.stringify(entry1) + '\n' + JSON.stringify(entry2) + '\n'
      );

      processor.markEntriesProcessed([entry1], processor.QUEUE_FILE);

      // Re-read and verify
      const content = fs.readFileSync(processor.QUEUE_FILE, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter(line => line.trim());
      assert.strictEqual(lines.length, 2);

      const updated1 = JSON.parse(lines[0]);
      const updated2 = JSON.parse(lines[1]);

      assert.strictEqual(updated1.processed, true);
      assert.strictEqual(updated2.processed, undefined); // Not marked
    });

    it('should handle empty entries array', () => {
      const entry = { taskId: '1', trigger: 'task_completion' };
      fs.writeFileSync(processor.QUEUE_FILE, JSON.stringify(entry) + '\n');

      // Should not throw
      processor.markEntriesProcessed([], processor.QUEUE_FILE);

      const content = fs.readFileSync(processor.QUEUE_FILE, 'utf8');
      const parsed = JSON.parse(content.trim());
      assert.strictEqual(parsed.processed, undefined); // Unchanged
    });
  });

  describe('processQueue', () => {
    it('should process pending entries and output spawn instructions', () => {
      const entry = {
        taskId: '1',
        trigger: 'task_completion',
        timestamp: '2026-01-26T10:00:00Z',
        priority: 'high',
      };
      fs.writeFileSync(processor.QUEUE_FILE, JSON.stringify(entry) + '\n');

      const result = processor.processQueue(processor.QUEUE_FILE);

      assert.strictEqual(result.processed, 1);
      assert.ok(result.instructions.length > 0);
      assert.ok(result.instructions[0].includes('[REFLECTION-TRIGGER]'));
    });

    it('should return zero processed for empty queue', () => {
      const result = processor.processQueue(processor.QUEUE_FILE);
      assert.strictEqual(result.processed, 0);
      assert.strictEqual(result.instructions.length, 0);
    });

    it('should mark entries as processed after processing', () => {
      const entry = { taskId: '1', trigger: 'task_completion', timestamp: '2026-01-26T10:00:00Z' };
      fs.writeFileSync(processor.QUEUE_FILE, JSON.stringify(entry) + '\n');

      processor.processQueue(processor.QUEUE_FILE);

      // Re-read and verify marked as processed
      const content = fs.readFileSync(processor.QUEUE_FILE, 'utf8');
      const updated = JSON.parse(content.trim());
      assert.strictEqual(updated.processed, true);
    });
  });

  describe('main execution', () => {
    it('should exit 0 when reflection is disabled', async () => {
      process.env.REFLECTION_ENABLED = 'false';
      // main() would call process.exit, so we can't test it directly
      // Instead, test the isEnabled check
      assert.strictEqual(processor.isEnabled(), false);
      delete process.env.REFLECTION_ENABLED;
    });

    it('should exit 0 after processing (informational hook)', () => {
      // This is tested implicitly - the hook should never block
      // Exit code 0 = continue, exit code 2 = block
      const entry = { taskId: '1', trigger: 'task_completion' };
      fs.writeFileSync(processor.QUEUE_FILE, JSON.stringify(entry) + '\n');

      const result = processor.processQueue(processor.QUEUE_FILE);
      assert.strictEqual(result.processed, 1);
    });
  });
});
