'use strict';

/**
 * D1 TDD — Agent-ID Handshake (file-based PID-keyed JSON)
 * Task: #11 (Red test) → #12 (Green impl)
 * Spec: .claude/context/plans/specs/d1-agent-id-handshake.md
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ── SUT ──────────────────────────────────────────────────────────────────────
const {
  writeAgentContext,
  readAgentContext,
  clearAgentContext,
  cleanupStaleContexts,
} = require('../../../.claude/lib/agent/agent-id-handshake.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a valid payload with configurable expiresAt offset (ms from now). */
function makePayload(opts = {}) {
  const now = Date.now();
  const ttl = opts.ttlMs !== undefined ? opts.ttlMs : 60 * 60 * 1000; // default 60 min
  return {
    agentId: opts.agentId || 'test-agent',
    parentPid: opts.parentPid !== undefined ? opts.parentPid : null,
    spawnedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
    metadata: opts.metadata || {},
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('agent-id-handshake', () => {
  // Use a fake PID range that won't collide with real processes
  const BASE_PID = 9_000_000;

  afterEach(() => {
    // Clean up any test PIDs after each test to avoid interference
    for (let p = BASE_PID; p < BASE_PID + 20; p++) {
      try {
        clearAgentContext(p);
      } catch (_) {
        // ignore
      }
    }
  });

  // ── Case 1: Write/read roundtrip ──────────────────────────────────────────
  it('write payload → read returns exact payload', () => {
    const pid = BASE_PID + 1;
    const payload = makePayload({ agentId: 'developer', parentPid: 1234 });

    writeAgentContext(pid, payload);
    const result = readAgentContext(pid);

    assert.ok(result !== null, 'Expected result to be non-null');
    assert.equal(result.agentId, payload.agentId);
    assert.equal(result.parentPid, payload.parentPid);
    assert.equal(result.spawnedAt, payload.spawnedAt);
    assert.equal(result.expiresAt, payload.expiresAt);
    assert.deepEqual(result.metadata, payload.metadata);
  });

  // ── Case 2: Missing PID returns null ─────────────────────────────────────
  it('reading missing PID returns null (not throw)', () => {
    const pid = BASE_PID + 2;
    // Ensure file does not exist
    clearAgentContext(pid);

    let result;
    assert.doesNotThrow(() => {
      result = readAgentContext(pid);
    });
    assert.equal(result, null);
  });

  // ── Case 3: Expired entry returns null ───────────────────────────────────
  it('expired entry (past expiresAt) returns null', () => {
    const pid = BASE_PID + 3;
    // Write a payload that expired 1 second ago
    const payload = makePayload({ ttlMs: -1000 });

    writeAgentContext(pid, payload);
    const result = readAgentContext(pid);

    assert.equal(result, null, 'Expired entry should return null');
  });

  // ── Case 4: cleanupStaleContexts removes expired, preserves fresh ─────────
  it('cleanupStaleContexts removes expired, preserves fresh', () => {
    const freshPid = BASE_PID + 4;
    const expiredPid = BASE_PID + 5;

    const freshPayload = makePayload({ ttlMs: 60 * 60 * 1000 }); // expires in 1hr
    const expiredPayload = makePayload({ ttlMs: -1000 }); // already expired

    writeAgentContext(freshPid, freshPayload);
    writeAgentContext(expiredPid, expiredPayload);

    const stats = cleanupStaleContexts();

    assert.ok(typeof stats.removed === 'number', 'stats.removed should be a number');
    assert.ok(typeof stats.kept === 'number', 'stats.kept should be a number');
    assert.ok(stats.removed >= 1, `Expected at least 1 removed, got ${stats.removed}`);

    // Fresh entry must still be readable
    const freshResult = readAgentContext(freshPid);
    assert.ok(freshResult !== null, 'Fresh entry should still be readable after cleanup');

    // Expired entry should be gone
    const expiredResult = readAgentContext(expiredPid);
    assert.equal(expiredResult, null, 'Expired entry should be null after cleanup');
  });

  // ── Case 5: Concurrent writes to same PID — last-write-wins ──────────────
  it('concurrent writes to same PID — last-write-wins (no corruption)', () => {
    const pid = BASE_PID + 6;

    // Simulate two writes in quick succession
    const payload1 = makePayload({ agentId: 'agent-A', metadata: { seq: 1 } });
    const payload2 = makePayload({ agentId: 'agent-B', metadata: { seq: 2 } });

    writeAgentContext(pid, payload1);
    writeAgentContext(pid, payload2);

    const result = readAgentContext(pid);
    assert.ok(result !== null, 'Should have a readable result after concurrent writes');
    // Last write wins — agentId should be agent-B
    assert.equal(result.agentId, 'agent-B', 'Last write should win');
    assert.deepEqual(result.metadata, { seq: 2 });
  });

  // ── Case 6: clearAgentContext removes entry ───────────────────────────────
  it('clearAgentContext removes entry', () => {
    const pid = BASE_PID + 7;
    const payload = makePayload({ agentId: 'qa' });

    writeAgentContext(pid, payload);
    // Confirm it's there
    assert.ok(readAgentContext(pid) !== null, 'Should exist before clear');

    clearAgentContext(pid);

    const result = readAgentContext(pid);
    assert.equal(result, null, 'Should return null after clearAgentContext');
  });
});
