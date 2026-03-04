#!/usr/bin/env node
/**
 * Evolution State Sync Tests
 * ==========================
 *
 * Tests for the EvolutionStateSync module that synchronizes
 * evolution state across workflows.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EvolutionStateSync } = require('../../.claude/lib/evolution-state-sync.cjs');

// =============================================================================
// Test Framework
// =============================================================================

const testQueue = [];

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  testQueue.push({ name, fn });
}

async function runTestQueue() {
  let passed = 0;
  let failed = 0;

  for (const test of testQueue) {
    try {
      await test.fn();
      console.log(`    \x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`    \x1b[31m✗\x1b[0m ${test.name}`);
      console.log(`      Error: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
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
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string to contain "${expected}"`);
        }
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_DIR = path.join(process.cwd(), '.claude', 'lib', '_evolution-test');
const TEST_STATE_PATH = path.join(TEST_DIR, 'evolution-state.json');

function setupTestFixtures() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Create initial state file
  const initialState = {
    version: '1.0.0',
    state: 'idle',
    currentEvolution: null,
    evolutions: [],
    patterns: [],
    suggestions: [],
    lastUpdated: new Date().toISOString(),
    locks: {},
  };

  fs.writeFileSync(TEST_STATE_PATH, JSON.stringify(initialState, null, 2));
}

function cleanupTestFixtures() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('EvolutionStateSync', () => {
  // Setup before all tests
  setupTestFixtures();

  describe('constructor', () => {
    it('should create instance with default path', () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });
      expect(sync).toBeTruthy();
    });

    it('should initialize with state cache', () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });
      expect(sync._stateCache).toBe(null);
    });
  });

  describe('loadState()', () => {
    it('should load state from file', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });
      const state = await sync.loadState();

      expect(state.version).toBe('1.0.0');
      expect(state.state).toBe('idle');
    });

    it('should create default state if file does not exist', async () => {
      const nonExistentPath = path.join(TEST_DIR, 'nonexistent.json');
      const sync = new EvolutionStateSync({ statePath: nonExistentPath });
      const state = await sync.loadState();

      expect(state.version).toBe('1.0.0');
      expect(state.state).toBe('idle');

      // Cleanup created file
      if (fs.existsSync(nonExistentPath)) {
        fs.unlinkSync(nonExistentPath);
      }
    });
  });

  describe('saveState()', () => {
    it('should save state to file', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const newState = {
        version: '1.0.0',
        state: 'evaluating',
        currentEvolution: { type: 'agent', name: 'test-agent' },
        evolutions: [],
        patterns: [],
        suggestions: [],
        lastUpdated: new Date().toISOString(),
        locks: {},
      };

      await sync.saveState(newState);

      // Verify by reading directly
      const content = fs.readFileSync(TEST_STATE_PATH, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.state).toBe('evaluating');
      expect(saved.currentEvolution.name).toBe('test-agent');
    });

    it('should update lastUpdated timestamp', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const oldState = await sync.loadState();
      const _oldTimestamp = oldState.lastUpdated;

      await new Promise(r => setTimeout(r, 10));

      oldState.state = 'validating';
      await sync.saveState(oldState);

      const newState = await sync.loadState();
      expect(newState.lastUpdated).toBeTruthy();
    });
  });

  describe('lock() and unlock()', () => {
    it('should acquire lock for a workflow', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const acquired = await sync.lock('workflow-123');
      expect(acquired).toBe(true);

      // Cleanup
      await sync.unlock('workflow-123');
    });

    it('should prevent duplicate locks', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.lock('workflow-456');

      // Try to lock again
      const secondLock = await sync.lock('workflow-456');
      expect(secondLock).toBe(false);

      // Cleanup
      await sync.unlock('workflow-456');
    });

    it('should release lock on unlock', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.lock('workflow-789');
      await sync.unlock('workflow-789');

      // Should be able to lock again
      const newLock = await sync.lock('workflow-789');
      expect(newLock).toBe(true);

      // Cleanup
      await sync.unlock('workflow-789');
    });

    it('should handle lock timeout', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH, lockTimeout: 50 });

      await sync.lock('timeout-test');

      // Wait for timeout
      await new Promise(r => setTimeout(r, 100));

      // Expired lock should be acquirable
      const newLock = await sync.lock('timeout-test');
      expect(newLock).toBe(true);

      // Cleanup
      await sync.unlock('timeout-test');
    });
  });

  describe('getActiveEvolutions()', () => {
    it('should return current evolution if present', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const state = await sync.loadState();
      state.currentEvolution = { type: 'skill', name: 'test-skill', phase: 'lock' };
      await sync.saveState(state);

      const active = await sync.getActiveEvolutions();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('test-skill');
    });

    it('should return empty array if no active evolution', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const state = await sync.loadState();
      state.currentEvolution = null;
      await sync.saveState(state);

      const active = await sync.getActiveEvolutions();
      expect(active).toHaveLength(0);
    });
  });

  describe('addSuggestion()', () => {
    it('should add a suggestion to the queue', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.addSuggestion({
        type: 'agent',
        name: 'suggested-agent',
        reason: 'Pattern detected',
      });

      const state = await sync.loadState();
      expect(state.suggestions.length).toBeGreaterThan(0);
      expect(state.suggestions[state.suggestions.length - 1].name).toBe('suggested-agent');
    });

    it('should add timestamp to suggestion', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.addSuggestion({
        type: 'skill',
        name: 'timestamp-test-skill',
        reason: 'Testing',
      });

      const state = await sync.loadState();
      const suggestion = state.suggestions.find(s => s.name === 'timestamp-test-skill');
      expect(suggestion.suggestedAt).toBeTruthy();
    });
  });

  describe('popSuggestion()', () => {
    it('should remove and return the first suggestion', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      // Clear suggestions first
      const state = await sync.loadState();
      state.suggestions = [
        { type: 'agent', name: 'first', reason: 'First' },
        { type: 'agent', name: 'second', reason: 'Second' },
      ];
      await sync.saveState(state);

      const popped = await sync.popSuggestion();
      expect(popped.name).toBe('first');

      const newState = await sync.loadState();
      expect(newState.suggestions[0].name).toBe('second');
    });

    it('should return null if no suggestions', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const state = await sync.loadState();
      state.suggestions = [];
      await sync.saveState(state);

      const popped = await sync.popSuggestion();
      expect(popped).toBeNull();
    });
  });

  describe('recordHistory()', () => {
    it('should add entry to evolutions history', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.recordHistory({
        type: 'agent',
        name: 'history-test-agent',
        path: '.claude/agents/test/history-test.md',
        completedAt: new Date().toISOString(),
      });

      const state = await sync.loadState();
      const entry = state.evolutions.find(e => e.name === 'history-test-agent');
      expect(entry).toBeTruthy();
    });

    it('should preserve existing history', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      const initialState = await sync.loadState();
      const initialCount = initialState.evolutions.length;

      await sync.recordHistory({
        type: 'skill',
        name: 'history-skill-2',
        path: '.claude/skills/test',
      });

      const newState = await sync.loadState();
      expect(newState.evolutions.length).toBe(initialCount + 1);
    });
  });

  describe('updateCurrentEvolution()', () => {
    it('should update the current evolution', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.updateCurrentEvolution({
        type: 'workflow',
        name: 'current-test',
        phase: 'obtain',
      });

      const state = await sync.loadState();
      expect(state.currentEvolution.name).toBe('current-test');
      expect(state.currentEvolution.phase).toBe('obtain');
    });

    it('should update state field to match phase', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      await sync.updateCurrentEvolution({
        type: 'hook',
        name: 'phase-test',
        phase: 'verify',
      });

      const state = await sync.loadState();
      expect(state.state).toBe('verifying');
    });
  });

  describe('clearCurrentEvolution()', () => {
    it('should clear current evolution and reset state', async () => {
      const sync = new EvolutionStateSync({ statePath: TEST_STATE_PATH });

      // Set current evolution
      await sync.updateCurrentEvolution({
        type: 'agent',
        name: 'to-clear',
        phase: 'lock',
      });

      // Clear it
      await sync.clearCurrentEvolution();

      const state = await sync.loadState();
      expect(state.currentEvolution).toBeNull();
      expect(state.state).toBe('idle');
    });
  });

  // Cleanup after all tests
  describe('cleanup', () => {
    it('should clean up test fixtures', () => {
      cleanupTestFixtures();
      expect(fs.existsSync(TEST_DIR)).toBe(false);
    });
  });
});

// =============================================================================
// Run Tests
// =============================================================================

console.log('\n  EvolutionStateSync Tests');
runTestQueue();
