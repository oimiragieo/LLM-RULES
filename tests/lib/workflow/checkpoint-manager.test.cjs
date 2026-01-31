#!/usr/bin/env node
/**
 * Checkpoint Manager Tests
 * ========================
 *
 * Following TDD: Write tests first, watch them fail, then implement.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test framework
const tests = [];
let currentDescribe = '';

function describe(name, fn) {
  currentDescribe = name;
  fn();
  currentDescribe = '';
}

function it(name, fn) {
  tests.push({ name: `${currentDescribe} > ${name}`, fn });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  [PASS] ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`  [FAIL] ${test.name}`);
      console.log(`         ${error.message}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeInstanceOf(expected) {
      if (!(actual instanceof expected)) {
        throw new Error(`Expected instance of ${expected.name}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toMatch(pattern) {
      if (!pattern.test(actual)) {
        throw new Error(`Expected "${actual}" to match ${pattern}`);
      }
    },
    toThrow(expectedMessage) {
      // For async functions, actual should be a function that we call
      let threw = false;
      let thrownError = null;
      try {
        actual();
      } catch (e) {
        threw = true;
        thrownError = e;
      }
      if (!threw) {
        throw new Error('Expected function to throw');
      }
      if (expectedMessage && !thrownError.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", got "${thrownError.message}"`
        );
      }
    },
    async toThrowAsync(expectedMessage) {
      let threw = false;
      let thrownError = null;
      try {
        await actual();
      } catch (e) {
        threw = true;
        thrownError = e;
      }
      if (!threw) {
        throw new Error('Expected async function to throw');
      }
      if (expectedMessage && !thrownError.message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", got "${thrownError.message}"`
        );
      }
    },
  };
}

// =============================================================================
// Test Helpers
// =============================================================================

let testDir;
let checkpointDir;

function setupTestDir() {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  checkpointDir = path.join(testDir, 'checkpoints');
  fs.mkdirSync(checkpointDir, { recursive: true });
}

function cleanupTestDir() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

// Import module under test - WILL FAIL until implementation exists
let CheckpointManager, createCheckpointId, compressState, decompressState;

describe('CheckpointManager module exports', () => {
  it('should export CheckpointManager class', () => {
    const mod = require('../../../.claude/lib/workflow/checkpoint-manager.cjs');
    CheckpointManager = mod.CheckpointManager;
    createCheckpointId = mod.createCheckpointId;
    compressState = mod.compressState;
    decompressState = mod.decompressState;

    expect(typeof CheckpointManager).toBe('function');
    expect(typeof createCheckpointId).toBe('function');
    expect(typeof compressState).toBe('function');
    expect(typeof decompressState).toBe('function');
  });
});

describe('createCheckpointId', () => {
  it('should create unique checkpoint IDs', () => {
    const id1 = createCheckpointId();
    const id2 = createCheckpointId();
    expect(id1).toMatch(/^chk-\d+-[a-z0-9]+$/);
    expect(id1 !== id2).toBe(true);
  });

  it('should include timestamp in ID', () => {
    const before = Date.now();
    const id = createCheckpointId();
    const after = Date.now();
    const parts = id.split('-');
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp >= before).toBe(true);
    expect(timestamp <= after).toBe(true);
  });
});

describe('compressState / decompressState', () => {
  it('should compress and decompress state symmetrically', () => {
    const state = {
      phase: 'obtain',
      stepIndex: 2,
      context: { foo: 'bar', nested: { deep: 123 } },
      stepResults: { step1: { output: 'result1' } },
    };
    const compressed = compressState(state);
    expect(Buffer.isBuffer(compressed)).toBe(true);
    const decompressed = decompressState(compressed);
    expect(decompressed).toEqual(state);
  });

  it('should handle empty state', () => {
    const state = {};
    const compressed = compressState(state);
    const decompressed = decompressState(compressed);
    expect(decompressed).toEqual(state);
  });

  it('should handle large state', () => {
    const state = {
      largeArray: new Array(1000).fill('x'.repeat(100)),
      nestedObj: {},
    };
    for (let i = 0; i < 100; i++) {
      state.nestedObj[`key${i}`] = { value: i, data: 'x'.repeat(50) };
    }
    const compressed = compressState(state);
    const decompressed = decompressState(compressed);
    expect(decompressed).toEqual(state);
  });
});

describe('CheckpointManager constructor', () => {
  it('should create with default options', () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });
    expect(manager).toBeInstanceOf(CheckpointManager);
    cleanupTestDir();
  });

  it('should accept custom options', () => {
    setupTestDir();
    const manager = new CheckpointManager({
      checkpointDir,
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
      maxCount: 20,
      storage: 'file',
    });
    expect(manager).toBeInstanceOf(CheckpointManager);
    cleanupTestDir();
  });

  it('should support memory storage for testing', () => {
    const manager = new CheckpointManager({ storage: 'memory' });
    expect(manager).toBeInstanceOf(CheckpointManager);
  });
});

describe('CheckpointManager.save', () => {
  it('should save a checkpoint and return ID', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });
    const state = {
      runId: 'run-123',
      workflowName: 'agent-creator',
      workflowVersion: '1.0.0',
      phase: 'obtain',
      stepIndex: 2,
      context: { input: 'test' },
      stepResults: { step1: { output: 'done' } },
    };

    const checkpointId = await manager.save('workflow-123', state);

    expect(checkpointId).toMatch(/^chk-\d+-[a-z0-9]+$/);
    cleanupTestDir();
  });

  it('should persist checkpoint to disk', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });
    const state = { phase: 'lock', stepIndex: 0 };

    const _checkpointId = await manager.save('wf-1', state);

    // Check file exists
    const files = fs.readdirSync(checkpointDir);
    expect(files.length).toBeGreaterThan(0);
    cleanupTestDir();
  });

  it('should save multiple checkpoints for same workflow', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    await manager.save('wf-1', { phase: 'evaluate', stepIndex: 0 });
    await manager.save('wf-1', { phase: 'validate', stepIndex: 1 });
    await manager.save('wf-1', { phase: 'obtain', stepIndex: 2 });

    const checkpoints = await manager.list('wf-1');
    expect(checkpoints.length).toBe(3);
    cleanupTestDir();
  });
});

describe('CheckpointManager.load', () => {
  it('should load a saved checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });
    const state = {
      phase: 'verify',
      stepIndex: 4,
      context: { verified: true },
    };

    const checkpointId = await manager.save('wf-load', state);
    const loaded = await manager.load(checkpointId);

    expect(loaded.id).toBe(checkpointId);
    expect(loaded.phase).toBe('verify');
    expect(loaded.stepIndex).toBe(4);
    expect(loaded.context.verified).toBe(true);
    cleanupTestDir();
  });

  it('should throw for non-existent checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    await expect(async () => manager.load('chk-nonexistent-abc123')).toThrowAsync(
      'Checkpoint not found'
    );
    cleanupTestDir();
  });
});

describe('CheckpointManager.loadLatest', () => {
  it('should load the most recent checkpoint for a workflow', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    await manager.save('wf-latest', { phase: 'evaluate', stepIndex: 0 });
    await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
    await manager.save('wf-latest', { phase: 'validate', stepIndex: 1 });
    await new Promise(r => setTimeout(r, 10));
    await manager.save('wf-latest', { phase: 'obtain', stepIndex: 2 });

    const latest = await manager.loadLatest('wf-latest');

    expect(latest.phase).toBe('obtain');
    expect(latest.stepIndex).toBe(2);
    cleanupTestDir();
  });

  it('should return null if no checkpoints exist', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const latest = await manager.loadLatest('wf-nonexistent');

    expect(latest).toBe(null);
    cleanupTestDir();
  });
});

describe('CheckpointManager.list', () => {
  it('should list all checkpoints for a workflow', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    await manager.save('wf-list', { phase: 'evaluate' });
    await manager.save('wf-list', { phase: 'validate' });
    await manager.save('wf-other', { phase: 'obtain' });

    const checkpoints = await manager.list('wf-list');

    expect(checkpoints.length).toBe(2);
    cleanupTestDir();
  });

  it('should return empty array for unknown workflow', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const checkpoints = await manager.list('wf-unknown');

    expect(checkpoints).toEqual([]);
    cleanupTestDir();
  });

  it('should return checkpoints sorted by creation time', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    await manager.save('wf-sorted', { phase: 'evaluate' });
    await new Promise(r => setTimeout(r, 10));
    await manager.save('wf-sorted', { phase: 'validate' });
    await new Promise(r => setTimeout(r, 10));
    await manager.save('wf-sorted', { phase: 'obtain' });

    const checkpoints = await manager.list('wf-sorted');

    // Should be sorted newest first
    expect(checkpoints[0].phase).toBe('obtain');
    expect(checkpoints[2].phase).toBe('evaluate');
    cleanupTestDir();
  });
});

describe('CheckpointManager.delete', () => {
  it('should delete a specific checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const id = await manager.save('wf-del', { phase: 'evaluate' });
    await manager.delete(id);

    const checkpoints = await manager.list('wf-del');
    expect(checkpoints.length).toBe(0);
    cleanupTestDir();
  });

  it('should not throw for non-existent checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    // Should not throw
    await manager.delete('chk-nonexistent-xyz');
    cleanupTestDir();
  });
});

describe('CheckpointManager.cleanup', () => {
  it('should delete checkpoints older than maxAge', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    // Save checkpoint and modify its timestamp to be old
    await manager.save('wf-old', { phase: 'evaluate' });
    await new Promise(r => setTimeout(r, 10));
    await manager.save('wf-old', { phase: 'validate' });

    // Cleanup with very short maxAge
    const result = await manager.cleanup(1, 100); // 1ms maxAge

    expect(result.deletedByAge).toBeGreaterThan(0);
    cleanupTestDir();
  });

  it('should keep only maxCount recent checkpoints', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    for (let i = 0; i < 15; i++) {
      await manager.save('wf-count', { phase: 'step', stepIndex: i });
      await new Promise(r => setTimeout(r, 5));
    }

    const result = await manager.cleanup(Infinity, 10);

    const remaining = await manager.list('wf-count');
    expect(remaining.length).toBe(10);
    expect(result.deletedByCount).toBe(5);
    cleanupTestDir();
  });
});

describe('CheckpointManager.canResume', () => {
  it('should return true for valid checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const id = await manager.save('wf-resume', {
      phase: 'obtain',
      stepIndex: 2,
      context: {},
      stepResults: {},
    });

    const canResume = await manager.canResume(id);

    expect(canResume).toBe(true);
    cleanupTestDir();
  });

  it('should return false for non-existent checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const canResume = await manager.canResume('chk-nonexistent-xyz');

    expect(canResume).toBe(false);
    cleanupTestDir();
  });
});

describe('CheckpointManager.getResumePoint', () => {
  it('should return phase and step index from checkpoint', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const id = await manager.save('wf-point', {
      phase: 'lock',
      stepIndex: 3,
    });

    const checkpoint = await manager.load(id);
    const resumePoint = manager.getResumePoint(checkpoint);

    expect(resumePoint.phase).toBe('lock');
    expect(resumePoint.stepIndex).toBe(3);
    cleanupTestDir();
  });
});

describe('CheckpointManager memory storage', () => {
  it('should work without disk persistence', async () => {
    const manager = new CheckpointManager({ storage: 'memory' });

    const id1 = await manager.save('wf-mem', { phase: 'evaluate' });
    const _id2 = await manager.save('wf-mem', { phase: 'validate' });

    const checkpoints = await manager.list('wf-mem');
    expect(checkpoints.length).toBe(2);

    const loaded = await manager.load(id1);
    expect(loaded.phase).toBe('evaluate');
  });
});

describe('Checkpoint structure', () => {
  it('should include all required fields', async () => {
    setupTestDir();
    const manager = new CheckpointManager({ checkpointDir });

    const id = await manager.save('agent-creator', {
      phase: 'obtain',
      stepIndex: 2,
      context: { foo: 'bar' },
      stepResults: { step1: { output: 'x' } },
      metadata: { custom: 'data' },
    });

    const checkpoint = await manager.load(id);

    // Required fields from spec
    expect(checkpoint.id).toMatch(/^chk-\d+-[a-z0-9]+$/);
    expect(checkpoint.workflowName).toBe('agent-creator');
    expect(typeof checkpoint.createdAt).toBe('string');
    expect(checkpoint.phase).toBe('obtain');
    expect(checkpoint.stepIndex).toBe(2);
    expect(checkpoint.context).toEqual({ foo: 'bar' });
    expect(checkpoint.stepResults).toEqual({ step1: { output: 'x' } });
    expect(checkpoint.metadata).toEqual({ custom: 'data' });
    cleanupTestDir();
  });
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
  console.log('\n  Checkpoint Manager Tests\n');

  try {
    const success = await runTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n  Test runner error:', error.message);
    process.exit(1);
  }
}

main();
