'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stateManager = require('../../../.claude/lib/state/state-manager.cjs');

const TMP_DIR = path.resolve(__dirname, '../../_tmp/state-manager-test');
const STATE_FILE = path.join(TMP_DIR, 'STATE.md');

function cleanTmp() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

before(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

after(() => {
  cleanTmp();
});

beforeEach(() => {
  cleanTmp();
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

describe('state-manager', () => {
  describe('initState', () => {
    it('creates STATE.md at specified path', () => {
      stateManager.initState(STATE_FILE);
      assert.ok(fs.existsSync(STATE_FILE), 'STATE.md should be created');
    });

    it('returns empty initial state', () => {
      const state = stateManager.initState(STATE_FILE);
      assert.equal(state.phase, '');
      assert.equal(state.velocity, '');
      assert.deepEqual(state.decisions, []);
      assert.deepEqual(state.blockers, []);
    });

    it('STATE.md contains required sections', () => {
      stateManager.initState(STATE_FILE);
      const content = fs.readFileSync(STATE_FILE, 'utf8');
      assert.ok(content.includes('# SESSION STATE'), 'Should have SESSION STATE heading');
      assert.ok(content.includes('## Current Phase'), 'Should have Current Phase section');
      assert.ok(content.includes('## Velocity'), 'Should have Velocity section');
      assert.ok(content.includes('## Recent Decisions'), 'Should have Recent Decisions section');
      assert.ok(content.includes('## Blockers'), 'Should have Blockers section');
      assert.ok(content.includes('## Session Continuity'), 'Should have Session Continuity section');
    });
  });

  describe('updateState', () => {
    it('updates phase field', () => {
      stateManager.initState(STATE_FILE);
      const state = stateManager.updateState({ phase: 'Implementation' }, STATE_FILE);
      assert.equal(state.phase, 'Implementation');
    });

    it('persists update to disk', () => {
      stateManager.initState(STATE_FILE);
      stateManager.updateState({ phase: 'Testing', velocity: '3 tasks/day' }, STATE_FILE);
      const loaded = stateManager.readState(STATE_FILE);
      assert.equal(loaded.phase, 'Testing');
      assert.equal(loaded.velocity, '3 tasks/day');
    });

    it('merges updates without losing existing fields', () => {
      stateManager.initState(STATE_FILE);
      stateManager.updateState({ phase: 'Phase 1' }, STATE_FILE);
      stateManager.updateState({ velocity: 'fast' }, STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.equal(state.phase, 'Phase 1');
      assert.equal(state.velocity, 'fast');
    });
  });

  describe('readState', () => {
    it('returns empty state when file does not exist', () => {
      const state = stateManager.readState(STATE_FILE);
      assert.deepEqual(state.decisions, []);
      assert.deepEqual(state.blockers, []);
    });

    it('reads state written by initState', () => {
      stateManager.initState(STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.ok(Array.isArray(state.decisions));
      assert.ok(Array.isArray(state.blockers));
    });
  });

  describe('addDecision', () => {
    it('adds a decision to the list', () => {
      stateManager.initState(STATE_FILE);
      stateManager.addDecision('Use JWT for auth', STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.ok(state.decisions.includes('Use JWT for auth'), 'Decision should be stored');
    });

    it('keeps only the last 5 decisions', () => {
      stateManager.initState(STATE_FILE);
      for (let i = 1; i <= 7; i++) {
        stateManager.addDecision(`Decision ${i}`, STATE_FILE);
      }
      const state = stateManager.readState(STATE_FILE);
      assert.equal(state.decisions.length, 5, 'Should keep only last 5 decisions');
      assert.ok(state.decisions.includes('Decision 7'), 'Latest decision should be present');
      assert.ok(!state.decisions.includes('Decision 1'), 'Oldest decision should be dropped');
      assert.ok(!state.decisions.includes('Decision 2'), 'Second oldest should be dropped');
    });
  });

  describe('addBlocker / clearBlocker', () => {
    it('adds a blocker', () => {
      stateManager.initState(STATE_FILE);
      stateManager.addBlocker({ id: 'B1', description: 'Waiting for API key' }, STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.equal(state.blockers.length, 1);
      assert.equal(state.blockers[0].id, 'B1');
    });

    it('clears a blocker by id', () => {
      stateManager.initState(STATE_FILE);
      stateManager.addBlocker({ id: 'B1', description: 'Waiting for API key' }, STATE_FILE);
      stateManager.addBlocker({ id: 'B2', description: 'Missing dep' }, STATE_FILE);
      stateManager.clearBlocker('B1', STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.equal(state.blockers.length, 1);
      assert.equal(state.blockers[0].id, 'B2');
    });

    it('clearBlocker with non-existent id is a no-op', () => {
      stateManager.initState(STATE_FILE);
      stateManager.addBlocker({ id: 'B1', description: 'Some blocker' }, STATE_FILE);
      stateManager.clearBlocker('NOPE', STATE_FILE);
      const state = stateManager.readState(STATE_FILE);
      assert.equal(state.blockers.length, 1);
    });
  });
});
