'use strict';
// <!-- Agent: security-architect | Task: #S3-aip-tokens | Session: 2026-04-20 -->

/**
 * capability-tokens.test.cjs
 *
 * TDD Red-Green tests for AIP Invocation-Bound Capability Tokens
 * Per arXiv 2603.24775 — cryptographic delegation tokens for Task() spawns.
 * Target: < 5ms overhead per issue+verify (paper baseline: 2.35ms).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let issueToken, verifyToken;

try {
  ({ issueToken, verifyToken } =
    require('../../../.claude/lib/aip/capability-tokens.cjs'));
} catch (_) {
  // Module does not exist yet — tests will fail at invocation (RED phase)
}

// ---------------------------------------------------------------------------
// Test 1: issueToken returns a signed token string
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 1: issueToken produces signed token', () => {
  it('returns a non-empty string', () => {
    const token = issueToken('router', 'developer', ['Read', 'Write'], 3600);
    assert.equal(typeof token, 'string', 'Token must be a string');
    assert.ok(token.length > 0, 'Token must be non-empty');
  });

  it('token has 3 dot-separated parts (header.payload.signature)', () => {
    const token = issueToken('router', 'developer', ['Read', 'Write'], 3600);
    const parts = token.split('.');
    assert.equal(parts.length, 3, `Expected 3 parts, got ${parts.length}: ${token}`);
  });

  it('payload is valid base64url JSON containing required claims', () => {
    const token = issueToken('planner', 'developer', ['Task'], 1800);
    const parts = token.split('.');
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    assert.equal(payload.src, 'planner', 'src claim must be delegatorAgentId');
    assert.equal(payload.dst, 'developer', 'dst claim must be delegateeAgentId');
    assert.deepEqual(payload.cap, ['Task'], 'cap claim must be capabilities array');
    assert.ok(typeof payload.exp === 'number', 'exp claim must be a number (unix timestamp)');
    assert.ok(typeof payload.iat === 'number', 'iat claim must be a number (unix timestamp)');
    assert.ok(typeof payload.jti === 'string' && payload.jti.length > 0, 'jti must be a non-empty string');
  });
});

// ---------------------------------------------------------------------------
// Test 2: verifyToken returns boolean
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 2: verifyToken returns boolean', () => {
  it('returns true for a valid token with matching delegatee and capability', () => {
    const token = issueToken('router', 'developer', ['Read', 'Write', 'Bash'], 3600);
    const result = verifyToken(token, 'developer', 'Read');
    assert.equal(result, true, 'verifyToken must return true for valid token');
  });

  it('returns false for wrong delegatee', () => {
    const token = issueToken('router', 'developer', ['Read'], 3600);
    const result = verifyToken(token, 'qa', 'Read');
    assert.equal(result, false, 'verifyToken must return false when delegatee does not match');
  });
});

// ---------------------------------------------------------------------------
// Test 3: TTL expiry enforced (1-hour default)
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 3: TTL expiry enforced', () => {
  it('token issued with ttl=1 (1 second) expires and verifyToken returns false after expiry', () => {
    // Issue a token that is already expired (negative TTL creates past expiry)
    const token = issueToken('router', 'developer', ['Read'], -1);
    const result = verifyToken(token, 'developer', 'Read');
    assert.equal(result, false, 'Expired token must not verify');
  });

  it('default TTL is 3600 seconds (1 hour)', () => {
    // Issue token without explicit TTL — library should use 3600s default
    const token = issueToken('router', 'developer', ['Read']);
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const ttl = payload.exp - payload.iat;
    assert.ok(ttl >= 3590 && ttl <= 3610, `Expected TTL ~3600s, got ${ttl}s`);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Capability scope enforcement
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 4: capability scope enforced', () => {
  it('verifyToken returns false when required capability not in token scope', () => {
    const token = issueToken('router', 'developer', ['Read', 'Write'], 3600);
    const result = verifyToken(token, 'developer', 'Bash');
    assert.equal(result, false, 'Must reject capability not in token scope');
  });

  it('verifyToken returns true for each capability in scope', () => {
    const caps = ['Read', 'Write', 'Task'];
    const token = issueToken('router', 'developer', caps, 3600);
    for (const cap of caps) {
      const result = verifyToken(token, 'developer', cap);
      assert.equal(result, true, `Must accept capability ${cap} which is in scope`);
    }
  });

  it('wildcard capability "*" grants all tool access', () => {
    const token = issueToken('router', 'security-architect', ['*'], 3600);
    assert.equal(verifyToken(token, 'security-architect', 'Bash'), true);
    assert.equal(verifyToken(token, 'security-architect', 'Write'), true);
    assert.equal(verifyToken(token, 'security-architect', 'AnyTool'), true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Invalid signature → verification fails
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 5: invalid signature fails', () => {
  it('tampered payload fails verification', () => {
    const token = issueToken('router', 'developer', ['Read'], 3600);
    const parts = token.split('.');
    // Tamper the payload: change dst to 'attacker'
    const tamperedPayload = Buffer.from(
      JSON.stringify({ src: 'router', dst: 'attacker', cap: ['Read'], exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), jti: 'tampered' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const result = verifyToken(tamperedToken, 'attacker', 'Read');
    assert.equal(result, false, 'Tampered token must fail verification');
  });

  it('random string fails verification gracefully', () => {
    const result = verifyToken('not.a.valid.token', 'developer', 'Read');
    assert.equal(result, false, 'Garbage token must return false, not throw');
  });

  it('empty string fails verification gracefully', () => {
    const result = verifyToken('', 'developer', 'Read');
    assert.equal(result, false, 'Empty token must return false, not throw');
  });
});

// ---------------------------------------------------------------------------
// Test 6: AIP_TOKENS=off escape hatch
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 6: AIP_TOKENS=off bypass', () => {
  let origEnv;

  before(() => {
    origEnv = process.env.AIP_TOKENS;
    process.env.AIP_TOKENS = 'off';
  });

  after(() => {
    if (origEnv === undefined) {
      delete process.env.AIP_TOKENS;
    } else {
      process.env.AIP_TOKENS = origEnv;
    }
  });

  it('verifyToken returns true for ANY token (including invalid) when AIP_TOKENS=off', () => {
    assert.equal(verifyToken('garbage.token.here', 'developer', 'Bash'), true,
      'AIP_TOKENS=off must bypass ALL verification');
    assert.equal(verifyToken('', 'anyone', 'anything'), true,
      'AIP_TOKENS=off must bypass empty token');
  });

  it('verifyToken returns true for expired token when AIP_TOKENS=off', () => {
    const expired = issueToken('router', 'developer', ['Read'], -100);
    assert.equal(verifyToken(expired, 'developer', 'Read'), true,
      'AIP_TOKENS=off must bypass expiry check');
  });
});

// ---------------------------------------------------------------------------
// Test 7: Benchmark — overhead < 5ms for issue + verify combined
// ---------------------------------------------------------------------------

describe('AIP capability-tokens — Test 7: overhead benchmark < 5ms', () => {
  it('issue + verify combined completes in < 5ms (10-run average)', () => {
    const ITERATIONS = 10;
    const start = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const token = issueToken('router', 'developer', ['Read', 'Write', 'Task'], 3600);
      verifyToken(token, 'developer', 'Write');
    }
    const elapsed = Date.now() - start;
    const avgMs = elapsed / ITERATIONS;
    assert.ok(
      avgMs < 5,
      `Average overhead ${avgMs.toFixed(2)}ms exceeds 5ms target (paper baseline 2.35ms). Total ${elapsed}ms for ${ITERATIONS} iterations.`
    );
  });

  it('issueToken alone completes in < 3ms (stretch goal: < 2.35ms paper baseline)', () => {
    const ITERATIONS = 10;
    const start = Date.now();
    for (let i = 0; i < ITERATIONS; i++) {
      issueToken('router', 'developer', ['Read'], 3600);
    }
    const elapsed = Date.now() - start;
    const avgMs = elapsed / ITERATIONS;
    // Report but don't fail — this is a stretch goal
    process.stderr.write(
      `[BENCH] issueToken avg: ${avgMs.toFixed(3)}ms (paper baseline 2.35ms)\n`
    );
    // Hard limit: < 3ms average (allowing for Windows timer resolution)
    assert.ok(avgMs < 3, `issueToken avg ${avgMs.toFixed(2)}ms exceeds 3ms hard limit`);
  });
});
