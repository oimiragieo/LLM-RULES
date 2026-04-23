'use strict';
// <!-- Agent: security-architect | Task: #S3-aip-tokens | Session: 2026-04-20 -->

/**
 * capability-tokens.cjs
 *
 * AIP Invocation-Bound Capability Tokens
 * Per arXiv 2603.24775 — cryptographic delegation tokens for Task() spawns.
 *
 * Design decisions:
 * - HMAC-SHA256 signing with a local key (no external KMS required)
 * - Key loaded from env AIP_TOKEN_SECRET, then .claude/context/secrets/aip-key.local,
 *   then a deterministic fallback derived from project path (dev-only)
 * - Token format: base64url(header).base64url(payload).base64url(signature)
 * - Payload claims: src, dst, cap, exp, iat, jti, ver
 * - AIP_TOKENS=off escape hatch for dev/test environments
 * - Target overhead: <5ms per issue+verify (paper baseline: 2.35ms)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AIP_VERSION = '1';
const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const ALGO = 'sha256';
const KEY_FILE = path.join(__dirname, '../../context/secrets/aip-key.local');
const HMAC_ENCODING = 'base64url';

// ---------------------------------------------------------------------------
// Key management — DR-3 resolved: local file / env var / fallback
// ---------------------------------------------------------------------------

let _cachedKey = null;

/**
 * Load or derive the HMAC signing key.
 * Resolution order:
 *   1. AIP_TOKEN_SECRET env var (highest priority — CI/production override)
 *   2. .claude/context/secrets/aip-key.local (local dev, ignored by git)
 *   3. Deterministic fallback: sha256(cwd + hostname) — dev-only, logged
 *
 * The key is cached after first load for performance.
 */
function getSigningKey() {
  if (_cachedKey) return _cachedKey;

  // 1. Environment variable
  if (process.env.AIP_TOKEN_SECRET && process.env.AIP_TOKEN_SECRET.length >= 16) {
    _cachedKey = Buffer.from(process.env.AIP_TOKEN_SECRET, 'utf8');
    return _cachedKey;
  }

  // 2. Local key file
  try {
    if (fs.existsSync(KEY_FILE)) {
      const raw = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (raw.length >= 16) {
        _cachedKey = Buffer.from(raw, 'utf8');
        return _cachedKey;
      }
    }
  } catch (_) {
    // File unreadable — fall through to deterministic fallback
  }

  // 3. Deterministic dev fallback — never use in production
  process.stderr.write(
    '[aip-tokens] WARN: No AIP_TOKEN_SECRET or aip-key.local found. ' +
      'Using deterministic dev fallback key. Set AIP_TOKEN_SECRET for production.\n'
  );
  const seed = `aip-dev-key:${process.cwd()}:${os.hostname()}`;
  _cachedKey = crypto.createHash('sha256').update(seed).digest();
  return _cachedKey;
}

// ---------------------------------------------------------------------------
// Escape hatch
// ---------------------------------------------------------------------------

function isTokensDisabled() {
  return (process.env.AIP_TOKENS || '').toLowerCase() === 'off';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Buffer or string as base64url (no padding).
 */
function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64url');
}

/**
 * Compute HMAC-SHA256 signature for data with the signing key.
 */
function sign(data) {
  const key = getSigningKey();
  return crypto.createHmac(ALGO, key).update(data).digest(HMAC_ENCODING);
}

/**
 * Generate a compact unique token ID (16 random bytes → base64url, ~22 chars).
 */
function generateJti() {
  return crypto.randomBytes(16).toString('base64url');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issue an AIP Invocation-Bound Capability Token.
 *
 * @param {string}   delegatorAgentId  - Agent issuing the token (src)
 * @param {string}   delegateeAgentId  - Agent receiving the token (dst)
 * @param {string[]} capabilities      - Allowed tool names; ['*'] grants all
 * @param {number}   [ttl]             - TTL in seconds (default: 3600)
 * @returns {string} Signed token string: header.payload.signature
 */
function issueToken(delegatorAgentId, delegateeAgentId, capabilities, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const effectiveTtl = typeof ttl === 'number' ? ttl : DEFAULT_TTL_SECONDS;

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'AIP', ver: AIP_VERSION }));
  const payload = b64url(
    JSON.stringify({
      ver: AIP_VERSION,
      src: delegatorAgentId,
      dst: delegateeAgentId,
      cap: Array.isArray(capabilities) ? capabilities : [capabilities],
      iat: now,
      exp: now + effectiveTtl,
      jti: generateJti(),
    })
  );

  const signingInput = `${header}.${payload}`;
  const signature = sign(signingInput);
  return `${signingInput}.${signature}`;
}

/**
 * Verify an AIP token.
 *
 * @param {string} token               - Token string to verify
 * @param {string} expectedDelegatee   - Expected dst claim
 * @param {string} requiredCapability  - Tool name that must be in cap[]
 * @returns {boolean} true if token is valid, not expired, and grants the capability
 */
function verifyToken(token, expectedDelegatee, requiredCapability) {
  // Escape hatch: AIP_TOKENS=off bypasses ALL checks
  if (isTokensDisabled()) return true;

  try {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [header, payload, signature] = parts;

    // 1. Signature verification (timing-safe comparison)
    const signingInput = `${header}.${payload}`;
    const expectedSig = sign(signingInput);
    const sigBuf = Buffer.from(signature, 'base64url');
    const expectedBuf = Buffer.from(expectedSig, 'base64url');

    if (sigBuf.length !== expectedBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

    // 2. Decode payload
    const payloadJson = Buffer.from(payload, 'base64url').toString('utf8');
    const claims = JSON.parse(payloadJson);

    // 3. Expiry check
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now) return false;

    // 4. Delegatee check
    if (claims.dst !== expectedDelegatee) return false;

    // 5. Capability scope check
    const cap = Array.isArray(claims.cap) ? claims.cap : [];
    if (cap.includes('*')) return true;
    if (!cap.includes(requiredCapability)) return false;

    return true;
  } catch (_) {
    // Any parse/crypto error → reject token (fail closed)
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  issueToken,
  verifyToken,
  AIP_VERSION,
  // Exported for testing/reset
  _resetKeyCache: () => {
    _cachedKey = null;
  },
};
