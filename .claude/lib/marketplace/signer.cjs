'use strict';
/**
 * Skill Bundle HMAC-SHA256 Signer
 * ================================
 * Signs and verifies skill bundles using a shared HMAC-SHA256 secret.
 *
 * DR-3 Decision (v3.2.0): Use symmetric HMAC with a shared secret sourced from
 * SKILL_MARKETPLACE_HMAC_KEY env var or .claude/context/secrets/marketplace-key.local.
 * Asymmetric signing (RSA/Ed25519) is deferred to v3.3.0 when a public-key
 * distribution registry is available.
 *
 * Canonical payload format (deterministic):
 *   Files in the bundle are sorted alphabetically by relative filename.
 *   Each file contributes: "filename\tcontent\n"
 *   All entries are concatenated and the result is HMAC-SHA256'd.
 *
 * @module signer
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

/**
 * Error thrown for skill bundle signing/verification failures.
 * Carries a machine-readable `code` property.
 */
class SkillBundleError extends Error {
  /**
   * @param {string} message  Human-readable description
   * @param {string} code     Machine-readable error code
   */
  constructor(message, code) {
    super(message);
    this.name = 'SkillBundleError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collect and sort all regular files in a directory (non-recursive for v3.2.0).
 * Returns an array of relative filenames sorted ascending.
 *
 * Throws NESTED_DIR_FOUND if any subdirectory is present (M-1).
 * Throws INVALID_FILENAME if any filename contains tab, newline, forward-slash, or backslash (M-1).
 *
 * @param {string} bundleDir  Absolute path to the skill bundle directory
 * @returns {string[]}        Sorted relative filenames
 */
function _listBundleFiles(bundleDir) {
  if (!fs.existsSync(bundleDir)) {
    throw new SkillBundleError(
      `Bundle directory not found: ${bundleDir}`,
      'BUNDLE_NOT_FOUND'
    );
  }

  const entries = fs.readdirSync(bundleDir);
  const files = [];

  for (const e of entries) {
    const stat = fs.statSync(path.join(bundleDir, e));
    if (stat.isDirectory()) {
      throw new SkillBundleError(
        `Bundle must not contain subdirectories (found: ${e}). Nested directories are not allowed.`,
        'NESTED_DIR_FOUND'
      );
    }
    if (/[\t\n/\\]/.test(e)) {
      throw new SkillBundleError(
        `Invalid filename in bundle: "${e}". Filenames must not contain tab, newline, or path separators.`,
        'INVALID_FILENAME'
      );
    }
    if (stat.isFile()) {
      files.push(e);
    }
  }

  if (files.length === 0) {
    throw new SkillBundleError(
      `Bundle directory is empty (no files): ${bundleDir}`,
      'EMPTY_BUNDLE'
    );
  }

  return files.sort();
}

/**
 * Build the canonical payload string from all files in the bundle.
 *
 * Format (M-1 length-prefixed, injection-resistant):
 *   Each file contributes: "<flen>:<filename>|<clen>:<content>|"
 *   Files are processed in ascending alphabetical order.
 *
 * @param {string}   bundleDir  Absolute path to the bundle
 * @param {string[]} files      Sorted array of relative filenames
 * @returns {string}            Canonical UTF-8 payload
 */
function _buildPayload(bundleDir, files) {
  return files
    .map((fn) => {
      const content = fs.readFileSync(path.join(bundleDir, fn), 'utf8');
      return `${fn.length}:${fn}|${content.length}:${content}|`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sign a skill bundle directory with HMAC-SHA256.
 *
 * @param {string} bundleDir   Absolute path to the skill bundle directory
 * @param {string} hmacKey     Shared HMAC secret key (must be string, >= 32 chars)
 * @returns {string}           64-character lowercase hex HMAC-SHA256 signature
 * @throws {SkillBundleError}  BUNDLE_NOT_FOUND | EMPTY_BUNDLE | WEAK_KEY
 */
function signBundle(bundleDir, hmacKey) {
  if (typeof hmacKey !== 'string' || hmacKey.length < 32) {
    throw new SkillBundleError('HMAC key must be >=32 chars', 'WEAK_KEY');
  }
  const files = _listBundleFiles(bundleDir);
  const payload = _buildPayload(bundleDir, files);
  return crypto.createHmac('sha256', hmacKey).update(payload, 'utf8').digest('hex');
}

/**
 * Verify a skill bundle's HMAC-SHA256 signature.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param {string} bundleDir   Absolute path to the skill bundle directory
 * @param {string} signature   Expected 64-char hex signature
 * @param {string} hmacKey     Shared HMAC secret key (must be string, >= 32 chars)
 * @returns {boolean}          true if signature matches, false otherwise
 * @throws {SkillBundleError}  BUNDLE_NOT_FOUND | EMPTY_BUNDLE | WEAK_KEY
 */
function verifyBundle(bundleDir, signature, hmacKey) {
  if (typeof hmacKey !== 'string' || hmacKey.length < 32) {
    throw new SkillBundleError('HMAC key must be >=32 chars', 'WEAK_KEY');
  }
  const files = _listBundleFiles(bundleDir);
  const payload = _buildPayload(bundleDir, files);
  const computed = crypto.createHmac('sha256', hmacKey).update(payload, 'utf8').digest('hex');

  // Timing-safe comparison — both must be same length for timingSafeEqual
  if (computed.length !== signature.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    // Buffer.from will throw if signature contains non-hex characters
    return false;
  }
}

module.exports = {
  signBundle,
  verifyBundle,
  SkillBundleError,
};
