'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');


/**
 * P0 Verification: Session-to-session recall via consolidateSession.
 *
 * Proves that:
 *   1. STM data survives promotion to MTM via consolidateSession.
 *   2. MTM sessions are retrievable via getMTMSessions / findMTMSession.
 *   3. Multiple sessions accumulate in MTM correctly.
 *   4. extracted_memories field persists across tier promotion.
 */
describe('Session recall end-to-end', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-recall-'));
    const stmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'stm');
    const mtmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'mtm');
    fs.mkdirSync(stmDir, { recursive: true });
    fs.mkdirSync(mtmDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('STM data persists in MTM after consolidateSession', () => {
    const {
      writeSTMEntry, readSTMEntry, _consolidateSession, getMTMSessions,
    } = require('../../../.claude/lib/memory/memory-tiers.cjs');

    const sessionData = {
      session_id: 'recall-test-1',
      summary: 'Fixed authentication bug',
      files_modified: ['src/auth.ts', 'tests/auth.test.ts'],
      extracted_memories: [
        { id: 'mem-1', content: 'JWT refresh tokens need rotation' },
        { id: 'mem-2', content: 'Use bcrypt for password hashing' },
      ],
    };

    writeSTMEntry(sessionData, projectRoot);
    const stm = readSTMEntry(projectRoot);
    assert.ok(stm, 'STM should be readable');
    assert.equal(stm.session_id, 'recall-test-1');

    // Promote STM to MTM
    const result = _consolidateSession('recall-test-1', projectRoot);
    assert.equal(result.success, true);

    // STM should be cleared
    assert.equal(readSTMEntry(projectRoot), null, 'STM cleared after consolidation');

    // MTM should contain the session
    const mtmSessions = getMTMSessions(projectRoot);
    assert.equal(mtmSessions.length, 1);
    assert.equal(mtmSessions[0].session_id, 'recall-test-1');
    assert.equal(mtmSessions[0].tier, 'MTM');
    assert.equal(mtmSessions[0].summary, 'Fixed authentication bug');
  });

  it('extracted_memories survive STM to MTM promotion', () => {
    const { writeSTMEntry, _consolidateSession, getMTMSessions } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );

    writeSTMEntry(
      {
        session_id: 'memory-persist',
        extracted_memories: [
          { id: 'e1', content: 'Pattern A' },
          { id: 'e2', content: 'Pattern B' },
          { id: 'e3', content: 'Pattern C' },
        ],
      },
      projectRoot
    );

    _consolidateSession('memory-persist', projectRoot);

    const mtmSessions = getMTMSessions(projectRoot);
    assert.equal(mtmSessions.length, 1);
    assert.ok(
      Array.isArray(mtmSessions[0].extracted_memories),
      'extracted_memories should be array in MTM'
    );
    assert.equal(mtmSessions[0].extracted_memories.length, 3);
    const ids = mtmSessions[0].extracted_memories.map((m) => m.id);
    assert.deepEqual(ids, ['e1', 'e2', 'e3']);
  });

  it('multiple sessions accumulate in MTM', () => {
    const { writeSTMEntry, _consolidateSession, getMTMSessions } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );

    for (let i = 0; i < 3; i++) {
      writeSTMEntry(
        { session_id: `multi-${i}`, summary: `Session ${i}` },
        projectRoot
      );
      const result = _consolidateSession(`multi-${i}`, projectRoot);
      assert.equal(result.success, true, `consolidation ${i} should succeed`);
    }

    const mtmSessions = getMTMSessions(projectRoot);
    assert.equal(mtmSessions.length, 3, 'should have 3 MTM sessions');

    const sessionIds = mtmSessions.map((s) => s.session_id);
    assert.ok(sessionIds.includes('multi-0'));
    assert.ok(sessionIds.includes('multi-1'));
    assert.ok(sessionIds.includes('multi-2'));
  });

  it('findMTMSession retrieves specific session by ID', () => {
    const {
      writeSTMEntry, _consolidateSession, findMTMSession,
    } = require('../../../.claude/lib/memory/memory-tiers.cjs');

    writeSTMEntry(
      { session_id: 'find-me', summary: 'Needle in haystack' },
      projectRoot
    );
    _consolidateSession('find-me', projectRoot);

    // Add another session to ensure findMTMSession filters correctly
    writeSTMEntry(
      { session_id: 'other-session', summary: 'Not this one' },
      projectRoot
    );
    _consolidateSession('other-session', projectRoot);

    const found = findMTMSession('find-me', projectRoot);
    assert.ok(found, 'should find the session');
    assert.equal(found.data.session_id, 'find-me');
    assert.equal(found.data.summary, 'Needle in haystack');
    assert.ok(found.path, 'should include file path');

    // Non-existent session returns null
    const notFound = findMTMSession('does-not-exist', projectRoot);
    assert.equal(notFound, null);
  });

  it('consolidated_at metadata is added during promotion', () => {
    const { writeSTMEntry, _consolidateSession, getMTMSessions } = require(
      '../../../.claude/lib/memory/memory-tiers.cjs'
    );

    const before = new Date().toISOString();
    writeSTMEntry({ session_id: 'meta-test', summary: 'Metadata' }, projectRoot);
    _consolidateSession('meta-test', projectRoot);
    const after = new Date().toISOString();

    const mtmSessions = getMTMSessions(projectRoot);
    assert.equal(mtmSessions.length, 1);
    assert.ok(mtmSessions[0].consolidated_at, 'should have consolidated_at');
    assert.ok(
      mtmSessions[0].consolidated_at >= before,
      'consolidated_at should be after test start'
    );
    assert.ok(
      mtmSessions[0].consolidated_at <= after,
      'consolidated_at should be before test end'
    );
  });
});
