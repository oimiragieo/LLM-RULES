'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CircuitBreaker,
  STATE_CLOSED,
  STATE_OPEN,
  STATE_HALF_OPEN,
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RESET_TIMEOUT,
  DEFAULT_HALF_OPEN_MAX,
} = require('../../.claude/lib/routing/circuit-breaker.cjs');

// --- helpers ---

function makeBreaker(opts = {}, nowMs = Date.now()) {
  return new CircuitBreaker(opts, () => nowMs);
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  it('exports state strings', () => {
    assert.equal(STATE_CLOSED, 'closed');
    assert.equal(STATE_OPEN, 'open');
    assert.equal(STATE_HALF_OPEN, 'half_open');
  });

  it('exports default config values', () => {
    assert.equal(DEFAULT_FAILURE_THRESHOLD, 3);
    assert.equal(DEFAULT_RESET_TIMEOUT, 30000);
    assert.equal(DEFAULT_HALF_OPEN_MAX, 1);
  });
});

// ─── Default state ──────────────────────────────────────────────────────────

describe('default state', () => {
  it('unknown agent has CLOSED state', () => {
    const cb = makeBreaker();
    assert.equal(cb.getState('agent-a'), STATE_CLOSED);
  });

  it('canExecute returns true for unknown agent', () => {
    const cb = makeBreaker();
    assert.equal(cb.canExecute('agent-a'), true);
  });
});

// ─── CLOSED → OPEN transition ───────────────────────────────────────────────

describe('CLOSED → OPEN', () => {
  it('transitions to OPEN after failureThreshold failures', () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_CLOSED); // still under threshold
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_OPEN);
  });

  it('canExecute returns false when OPEN', () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    assert.equal(cb.canExecute('agent-a'), false);
  });
});

// ─── OPEN → HALF_OPEN transition ────────────────────────────────────────────

describe('OPEN → HALF_OPEN', () => {
  it('transitions to HALF_OPEN after resetTimeout', () => {
    let now = 1000000;
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000 }, () => now);

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_OPEN);

    // Advance past resetTimeout
    now += 6000;
    assert.equal(cb.getState('agent-a'), STATE_HALF_OPEN);
  });

  it('canExecute returns true in HALF_OPEN (within limit)', () => {
    let now = 1000000;
    const cb = new CircuitBreaker(
      { failureThreshold: 2, resetTimeout: 5000, halfOpenMax: 1 },
      () => now
    );

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');

    now += 6000;
    assert.equal(cb.canExecute('agent-a'), true);
  });

  it('canExecute enforces halfOpenMax cap (2nd probe blocked at limit 1)', () => {
    let now = 1000000;
    const cb = new CircuitBreaker(
      { failureThreshold: 2, resetTimeout: 5000, halfOpenMax: 1 },
      () => now
    );

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');

    now += 6000;
    assert.equal(cb.getState('agent-a'), STATE_HALF_OPEN);
    // First probe consumes the single half-open slot.
    assert.equal(cb.canExecute('agent-a'), true);
    // Second probe must be blocked until success/failure resolves the circuit.
    assert.equal(cb.canExecute('agent-a'), false);
  });

  it('canExecute allows halfOpenMax probes when limit > 1', () => {
    let now = 1000000;
    const cb = new CircuitBreaker(
      { failureThreshold: 2, resetTimeout: 5000, halfOpenMax: 2 },
      () => now
    );

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');

    now += 6000;
    assert.equal(cb.canExecute('agent-a'), true);
    assert.equal(cb.canExecute('agent-a'), true);
    assert.equal(cb.canExecute('agent-a'), false);
  });
});

// ─── HALF_OPEN → CLOSED on success ─────────────────────────────────────────

describe('HALF_OPEN → CLOSED', () => {
  it('success in HALF_OPEN transitions to CLOSED', () => {
    let now = 1000000;
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000 }, () => now);

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');

    now += 6000;
    assert.equal(cb.getState('agent-a'), STATE_HALF_OPEN);

    cb.recordSuccess('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_CLOSED);
  });
});

// ─── HALF_OPEN → OPEN on failure ────────────────────────────────────────────

describe('HALF_OPEN → OPEN', () => {
  it('failure in HALF_OPEN transitions back to OPEN', () => {
    let now = 1000000;
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 5000 }, () => now);

    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');

    now += 6000;
    assert.equal(cb.getState('agent-a'), STATE_HALF_OPEN);

    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_OPEN);
  });
});

// ─── recordSuccess ──────────────────────────────────────────────────────────

describe('recordSuccess', () => {
  it('resets failure count in CLOSED state', () => {
    const cb = makeBreaker({ failureThreshold: 3 });
    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    cb.recordSuccess('agent-a');
    // Should reset — one more failure should NOT trip threshold
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_CLOSED);
  });

  it('increments success count in stats', () => {
    const cb = makeBreaker();
    cb.recordSuccess('agent-a');
    cb.recordSuccess('agent-a');
    const stats = cb.getStats('agent-a');
    assert.equal(stats.successes, 2);
  });
});

// ─── reset ──────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('resets OPEN circuit to CLOSED', () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_OPEN);

    cb.reset('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_CLOSED);
    assert.equal(cb.canExecute('agent-a'), true);
  });

  it('resets failure and success counts', () => {
    const cb = makeBreaker();
    cb.recordFailure('agent-a');
    cb.recordSuccess('agent-a');
    cb.reset('agent-a');
    const stats = cb.getStats('agent-a');
    assert.equal(stats.failures, 0);
    assert.equal(stats.successes, 0);
  });
});

// ─── getStats ───────────────────────────────────────────────────────────────

describe('getStats', () => {
  it('returns correct structure', () => {
    const cb = makeBreaker();
    cb.recordFailure('agent-a');
    const stats = cb.getStats('agent-a');
    assert.ok('state' in stats);
    assert.ok('failures' in stats);
    assert.ok('successes' in stats);
    assert.ok('lastFailure' in stats);
    assert.ok('lastSuccess' in stats);
  });

  it('returns default stats for unknown agent', () => {
    const cb = makeBreaker();
    const stats = cb.getStats('unknown');
    assert.equal(stats.state, STATE_CLOSED);
    assert.equal(stats.failures, 0);
    assert.equal(stats.successes, 0);
    assert.equal(stats.lastFailure, null);
    assert.equal(stats.lastSuccess, null);
  });
});

// ─── getAllStates ────────────────────────────────────────────────────────────

describe('getAllStates', () => {
  it('returns all tracked agents', () => {
    const cb = makeBreaker();
    cb.recordFailure('agent-a');
    cb.recordSuccess('agent-b');
    const states = cb.getAllStates();
    assert.ok('agent-a' in states);
    assert.ok('agent-b' in states);
  });

  it('returns empty object when no agents tracked', () => {
    const cb = makeBreaker();
    assert.deepEqual(cb.getAllStates(), {});
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles null/undefined agentType gracefully', () => {
    const cb = makeBreaker();
    assert.doesNotThrow(() => cb.recordFailure(null));
    assert.doesNotThrow(() => cb.recordSuccess(undefined));
    assert.doesNotThrow(() => cb.canExecute(null));
    assert.equal(cb.getState(null), STATE_CLOSED);
    assert.doesNotThrow(() => cb.reset(null));
  });

  it('independent circuits per agent', () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    cb.recordFailure('agent-a');
    cb.recordFailure('agent-a');
    assert.equal(cb.getState('agent-a'), STATE_OPEN);
    assert.equal(cb.getState('agent-b'), STATE_CLOSED);
    assert.equal(cb.canExecute('agent-b'), true);
  });

  it('constructor uses defaults when no options provided', () => {
    const cb = new CircuitBreaker();
    assert.equal(cb.canExecute('any'), true);
  });
});
