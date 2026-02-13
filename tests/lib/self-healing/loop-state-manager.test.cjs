const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import module under test
const {
  _LOOP_STATE_FILE,
  getState,
  saveState,
  resetState,
  recordAction,
  recordSpawn,
  decrementSpawnDepth,
  recordEvolution,
} = require('../../../.claude/lib/self-healing/loop-state-manager.cjs');

describe('loop-state-manager', () => {
  let tempDir;
  let tempStateFile;

  beforeEach(() => {
    // Create temporary directory for test state files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-state-test-'));
    tempStateFile = path.join(tempDir, 'loop-state.json');

    // Set test session ID
    process.env.CLAUDE_SESSION_ID = 'test-session-123';
  });

  afterEach(() => {
    // Clean up temp directory and files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Clean up lock files
    const lockFile = tempStateFile + '.lock';
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }

    // Reset env
    delete process.env.CLAUDE_SESSION_ID;
  });

  describe('getState', () => {
    it('should return default state when file does not exist', () => {
      const state = getState(tempStateFile);

      assert.strictEqual(typeof state, 'object');
      assert.strictEqual(state.sessionId, 'test-session-123');
      assert.ok(state.createdAt);
      assert.ok(state.updatedAt);
      assert.strictEqual(typeof state.spawnDepth, 'number');
      assert.strictEqual(Array.isArray(state.actionHistory), true);
    });

    it('should read existing state from file', () => {
      const initialState = {
        sessionId: 'test-session-123',
        spawnDepth: 5,
        actionHistory: [{ action: 'test-action', count: 3, lastAt: new Date().toISOString() }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(), // Recent timestamp to avoid stale repair
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(initialState));

      const state = getState(tempStateFile);

      assert.strictEqual(state.sessionId, 'test-session-123');
      assert.strictEqual(state.spawnDepth, 5);
      assert.strictEqual(state.actionHistory.length, 1);
      assert.strictEqual(state.actionHistory[0].action, 'test-action');
    });

    it('should handle corrupted state file gracefully', () => {
      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, 'invalid-json{{{');

      const state = getState(tempStateFile);

      // Should return defaults
      assert.strictEqual(typeof state, 'object');
      assert.strictEqual(state.sessionId, 'test-session-123');
    });

    it('should reset state when session ID changes', () => {
      const oldState = {
        sessionId: 'old-session',
        spawnDepth: 10,
        actionHistory: [{ action: 'old-action', count: 5, lastAt: new Date().toISOString() }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(oldState));

      process.env.CLAUDE_SESSION_ID = 'new-session';

      const state = getState(tempStateFile);

      // Should get fresh state for new session
      assert.strictEqual(state.sessionId, 'new-session');
      assert.strictEqual(state.spawnDepth, 0);
      assert.strictEqual(state.actionHistory.length, 0);
    });

    it('should repair stale spawn depth', () => {
      const staleState = {
        sessionId: 'test-session-123',
        spawnDepth: 5,
        actionHistory: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(staleState));

      const state = getState(tempStateFile);

      // Should repair stale spawn depth (default stale time is 10 minutes)
      assert.strictEqual(state.spawnDepth, 0);
    });

    it('should prune old action history', () => {
      const oldTimestamp = new Date(Date.now() - 40 * 60 * 1000).toISOString(); // 40 minutes ago
      const recentTimestamp = new Date().toISOString();

      const stateWithHistory = {
        sessionId: 'test-session-123',
        spawnDepth: 0,
        actionHistory: [
          { action: 'old-action', count: 1, lastAt: oldTimestamp },
          { action: 'recent-action', count: 2, lastAt: recentTimestamp },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(stateWithHistory));

      const state = getState(tempStateFile);

      // Should prune old actions (default window is 30 minutes)
      assert.strictEqual(state.actionHistory.length, 1);
      assert.strictEqual(state.actionHistory[0].action, 'recent-action');
    });
  });

  describe('saveState', () => {
    it('should save state to file', () => {
      const state = {
        sessionId: 'test-session',
        spawnDepth: 3,
        actionHistory: [{ action: 'test', count: 1, lastAt: new Date().toISOString() }],
      };

      saveState(state, tempStateFile);

      assert.ok(fs.existsSync(tempStateFile));

      const saved = JSON.parse(fs.readFileSync(tempStateFile, 'utf8'));
      assert.strictEqual(saved.sessionId, 'test-session');
      assert.strictEqual(saved.spawnDepth, 3);
      assert.ok(saved.updatedAt);
    });

    it('should create directory if missing', () => {
      const nestedPath = path.join(tempDir, 'nested', 'dir', 'state.json');

      saveState({ sessionId: 'test' }, nestedPath);

      assert.ok(fs.existsSync(nestedPath));
    });

    it('should update timestamp on save', () => {
      const state = {
        sessionId: 'test',
        spawnDepth: 0,
        actionHistory: [],
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      saveState(state, tempStateFile);

      const saved = JSON.parse(fs.readFileSync(tempStateFile, 'utf8'));
      assert.notStrictEqual(saved.updatedAt, '2024-01-01T00:00:00.000Z');
    });
  });

  describe('resetState', () => {
    it('should reset state to defaults', () => {
      // Create existing state
      const existingState = {
        sessionId: 'test-session-123',
        spawnDepth: 10,
        actionHistory: [{ action: 'test', count: 5, lastAt: new Date().toISOString() }],
        evolutionCount: 3,
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(existingState));

      const reset = resetState(tempStateFile);

      assert.strictEqual(reset.spawnDepth, 0);
      assert.strictEqual(reset.actionHistory.length, 0);
      assert.strictEqual(reset.evolutionCount, 0);

      const saved = JSON.parse(fs.readFileSync(tempStateFile, 'utf8'));
      assert.strictEqual(saved.spawnDepth, 0);
    });
  });

  describe('recordAction', () => {
    it('should record new action', () => {
      recordAction('test-action', tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.actionHistory.length, 1);
      assert.strictEqual(state.actionHistory[0].action, 'test-action');
      assert.strictEqual(state.actionHistory[0].count, 1);
      assert.ok(state.actionHistory[0].lastAt);
    });

    it('should increment count for existing action', () => {
      // Use a unique temp file to avoid state cross-contamination
      const isolatedFile = path.join(tempDir, 'isolated-action-test.json');

      // First verify file doesn't exist
      if (fs.existsSync(isolatedFile)) {
        fs.unlinkSync(isolatedFile);
      }

      recordAction('unique-test-action-123', isolatedFile);
      recordAction('unique-test-action-123', isolatedFile);

      const state = getState(isolatedFile);

      // Find our specific action
      const ourAction = state.actionHistory.find(h => h.action === 'unique-test-action-123');
      assert.ok(ourAction, 'Action should exist');
      assert.strictEqual(ourAction.count, 2, `Expected count 2 but got ${ourAction.count}`);
    });

    it('should handle invalid action gracefully', () => {
      // Reset to clean state first
      resetState(tempStateFile);

      // These should all be ignored by the recordAction function
      recordAction(null, tempStateFile);
      recordAction(undefined, tempStateFile);
      // Note: empty string '' is falsy and will be ignored by the guard

      const state = getState(tempStateFile);
      // After resetState, there may be default history entries from the schema
      // Check that no invalid actions were added
      const hasNullAction = state.actionHistory.some(h => h.action === null || h.action === '' || h.action === undefined);
      assert.strictEqual(hasNullAction, false);
    });

    it('should limit history to 50 entries', () => {
      for (let i = 0; i < 60; i++) {
        recordAction(`action-${i}`, tempStateFile);
      }

      const state = getState(tempStateFile);
      assert.strictEqual(state.actionHistory.length, 50);
    });
  });

  describe('recordSpawn', () => {
    it('should increment spawn depth', () => {
      recordSpawn('developer', tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.spawnDepth, 1);
    });

    it('should record spawn action', () => {
      recordSpawn('qa', tempStateFile);

      const state = getState(tempStateFile);
      const spawnAction = state.actionHistory.find(h => h.action === 'spawn:qa');
      assert.ok(spawnAction);
      assert.strictEqual(spawnAction.count, 1);
    });

    it('should handle multiple spawns', () => {
      recordSpawn('developer', tempStateFile);
      recordSpawn('qa', tempStateFile);
      recordSpawn('developer', tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.spawnDepth, 3);

      const devSpawns = state.actionHistory.find(h => h.action === 'spawn:developer');
      assert.strictEqual(devSpawns.count, 2);
    });
  });

  describe('decrementSpawnDepth', () => {
    it('should decrement spawn depth', () => {
      recordSpawn('developer', tempStateFile);
      recordSpawn('qa', tempStateFile);

      decrementSpawnDepth(tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.spawnDepth, 1);
    });

    it('should not go below zero', () => {
      decrementSpawnDepth(tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.spawnDepth, 0);
    });
  });

  describe('recordEvolution', () => {
    it('should increment evolution count', () => {
      recordEvolution('agent', tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.evolutionCount, 1);
    });

    it('should record last evolution timestamp', () => {
      recordEvolution('skill', tempStateFile);

      const state = getState(tempStateFile);
      assert.ok(state.lastEvolutions);
      assert.ok(state.lastEvolutions.skill);
    });

    it('should record evolution action', () => {
      recordEvolution('hook', tempStateFile);

      const state = getState(tempStateFile);
      const evolutionAction = state.actionHistory.find(h => h.action === 'evolution:hook');
      assert.ok(evolutionAction);
    });

    it('should handle invalid evolution type', () => {
      recordEvolution(null, tempStateFile);
      recordEvolution('', tempStateFile);

      const state = getState(tempStateFile);
      assert.strictEqual(state.evolutionCount, 0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty state file', () => {
      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, '');

      const state = getState(tempStateFile);
      assert.strictEqual(typeof state, 'object');
      assert.strictEqual(state.sessionId, 'test-session-123');
    });

    it('should handle malformed action history', () => {
      const badState = {
        sessionId: 'test-session-123',
        spawnDepth: 0,
        actionHistory: [
          { action: 'valid', count: 1, lastAt: new Date().toISOString() },
          { notAnAction: 'invalid' },
          'string-entry',
          null,
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };

      fs.mkdirSync(path.dirname(tempStateFile), { recursive: true });
      fs.writeFileSync(tempStateFile, JSON.stringify(badState));

      const state = getState(tempStateFile);

      // Should filter out invalid entries
      assert.strictEqual(state.actionHistory.length, 1);
      assert.strictEqual(state.actionHistory[0].action, 'valid');
    });

    it('should handle missing sessionId in environment', () => {
      delete process.env.CLAUDE_SESSION_ID;

      const state = getState(tempStateFile);

      // Should use default session ID
      assert.strictEqual(state.sessionId, 'session-unknown');
    });
  });
});
