'use strict';
/**
 * skill-install CLI — Skill Marketplace Installer (v3.2.0, Slice S5)
 * ==================================================================
 * Fetches a skill bundle, verifies its HMAC-SHA256 signature, computes a
 * trust score, and installs if the signature and trust gate pass.
 *
 * Key management (v3.2.0):
 *   1. SKILL_MARKETPLACE_HMAC_KEY env var (preferred)
 *   2. .claude/context/secrets/marketplace-key.local (gitignored fallback)
 *
 * Exit codes (CLI):
 *   0 — success / dry-run
 *   1 — signature invalid (hard block)
 *   2 — trust score below threshold (soft block, overridable with --force)
 *   3 — bundle not found / other error
 *
 * Programmatic API (for tests):
 *   installSkill(options) → Promise<InstallResult>
 *
 * @module skill-install
 */

const fs = require('fs');
const path = require('path');

const { verifyBundle } = require('../../lib/marketplace/signer.cjs');
const { scoreSkill } = require('../../lib/marketplace/trust-scorer.cjs');

// ---------------------------------------------------------------------------
// Trust threshold validation helper (H-2)
// ---------------------------------------------------------------------------

/**
 * Parse and validate a trust threshold value.
 * Accepts only integers in [0, 100]. Any non-integer, negative, or >100 value
 * falls back to `fallback` (default 50).
 *
 * @param {*} raw
 * @param {number} [fallback=50]
 * @returns {number}
 */
function parseTrustThreshold(raw, fallback = 50) {
  const n = Number(raw);
  return !Number.isInteger(n) || n < 0 || n > 100 ? fallback : n;
}

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the HMAC key from env var or local secrets file.
 * Returns null if no key is available (caller must handle).
 *
 * @returns {string|null}
 */
function _resolveHmacKey() {
  const envKey = process.env.SKILL_MARKETPLACE_HMAC_KEY;
  if (envKey && envKey.trim()) {
    return envKey;
  }
  // Fall back to local secrets file (gitignored)
  const secretsPath = path.resolve(__dirname, '../../context/secrets/marketplace-key.local');
  if (fs.existsSync(secretsPath)) {
    const fileKey = fs.readFileSync(secretsPath, 'utf8').trim();
    if (fileKey) return fileKey;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core install logic (programmatic API)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} InstallOptions
 * @property {string}  bundlePath     Local path to the skill bundle directory
 * @property {string}  signature      HMAC-SHA256 hex signature to verify
 * @property {string}  [hmacKey]      Override key (for tests); falls back to env/file
 * @property {boolean} [dryRun]       Print action without installing (default false)
 * @property {boolean} [force]        Override trust threshold (not signature)
 * @property {string}  [installTarget] Directory to install skill into
 * @property {number}  [trustThreshold] Minimum trust score (default: SKILL_MARKETPLACE_MIN_TRUST or 50)
 * @property {object}  [trustSignals]  Quality signals for trust scoring
 */

/**
 * @typedef {object} InstallResult
 * @property {'installed'|'dry-run'|'refused'|'signature-invalid'} status
 * @property {number}  trustScore
 * @property {string}  trustTier
 * @property {string}  [reason]   Present when status is 'refused' or 'signature-invalid'
 */

/**
 * Install a skill bundle with signature verification and trust gating.
 *
 * @param {InstallOptions} options
 * @returns {Promise<InstallResult>}
 */
async function installSkill(options) {
  const {
    bundlePath,
    signature,
    hmacKey: overrideKey,
    dryRun = false,
    force = false,
    installTarget,
    trustSignals = {},
  } = options;

  const trustThreshold = parseTrustThreshold(
    options.trustThreshold ?? process.env.SKILL_MARKETPLACE_MIN_TRUST ?? 50
  );

  // Resolve HMAC key
  const hmacKey = overrideKey || _resolveHmacKey();
  if (!hmacKey) {
    return {
      status: 'signature-invalid',
      trustScore: 0,
      trustTier: 'experimental',
      reason: 'No HMAC key available. Set SKILL_MARKETPLACE_HMAC_KEY env var.',
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Signature verification (hard gate — --force does NOT override)
  // ---------------------------------------------------------------------------
  let sigValid;
  try {
    sigValid = verifyBundle(bundlePath, signature, hmacKey);
  } catch (err) {
    return {
      status: 'signature-invalid',
      trustScore: 0,
      trustTier: 'experimental',
      reason: `Signature verification failed: ${err.message}`,
    };
  }

  if (!sigValid) {
    return {
      status: 'signature-invalid',
      trustScore: 0,
      trustTier: 'experimental',
      reason: 'HMAC-SHA256 signature does not match bundle content.',
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Trust scoring
  // ---------------------------------------------------------------------------
  const { score: trustScore, tier: trustTier } = scoreSkill({
    source: trustSignals.source || 'community',
    hasTests: trustSignals.hasTests || false,
    ageDays: trustSignals.ageDays || 0,
    downloadCount: trustSignals.downloadCount || 0,
    reviewRating: trustSignals.reviewRating || 0,
  });

  // ---------------------------------------------------------------------------
  // 3. Trust gate (soft gate — overridable with --force)
  // ---------------------------------------------------------------------------
  if (!force && trustScore < trustThreshold) {
    return {
      status: 'refused',
      trustScore,
      trustTier,
      reason: `Trust score ${trustScore} is below threshold ${trustThreshold}. Use --force to override.`,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Dry-run
  // ---------------------------------------------------------------------------
  if (dryRun) {
    return { status: 'dry-run', trustScore, trustTier };
  }

  // ---------------------------------------------------------------------------
  // 5. Install — copy bundle files to installTarget (H-1: path traversal guards)
  // ---------------------------------------------------------------------------
  const bundleBaseName = _bundleName(bundlePath);
  const target = installTarget || path.join(process.cwd(), '.claude', 'skills', bundleBaseName);
  const resolvedTarget = path.resolve(target);
  fs.mkdirSync(resolvedTarget, { recursive: true });
  const files = fs.readdirSync(bundlePath);
  for (const file of files) {
    // H-1: reject filenames with path traversal sequences, absolute paths, or path separators
    if (file !== path.basename(file) || file.includes('..') || path.isAbsolute(file)) {
      return {
        status: 'signature-invalid',
        trustScore,
        trustTier,
        reason: `Path traversal attempt detected in bundle filename: "${file}"`,
      };
    }
    const src = path.join(bundlePath, file);
    const dst = path.join(resolvedTarget, file);
    // H-1: verify resolved destination stays inside installTarget
    if (
      !path.resolve(dst).startsWith(resolvedTarget + path.sep) &&
      path.resolve(dst) !== resolvedTarget
    ) {
      return {
        status: 'signature-invalid',
        trustScore,
        trustTier,
        reason: `Path traversal detected: destination "${dst}" escapes install target.`,
      };
    }
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dst);
    }
  }

  return { status: 'installed', trustScore, trustTier };
}

/**
 * Extract a skill name from the bundle path (last directory component).
 * Constrained to safe alphanumeric/dash/underscore names (H-1).
 * @param {string} bundlePath
 * @returns {string}
 */
function _bundleName(bundlePath) {
  const base = path.basename(bundlePath);
  // H-1: constrain bundle name to safe characters; replace unsafe chars with underscore
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(base)) {
    return base;
  }
  // Sanitize: strip everything except safe chars, truncate to 64
  return base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'skill';
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Parse argv into options.
 * @param {string[]} argv
 * @returns {object}
 */
function _parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    bundlePath: null,
    signature: null,
    dryRun: false,
    force: false,
    trustThreshold: parseTrustThreshold(process.env.SKILL_MARKETPLACE_MIN_TRUST ?? 50),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--signature' && args[i + 1]) {
      opts.signature = args[++i];
    } else if (arg === '--trust-threshold' && args[i + 1]) {
      opts.trustThreshold = parseInt(args[++i], 10);
    } else if (!arg.startsWith('--')) {
      opts.bundlePath = arg;
    }
  }
  return opts;
}

/* c8 ignore next */
if (require.main === module) {
  (async () => {
    const opts = _parseArgs(process.argv);

    if (!opts.bundlePath) {
      console.error(
        'Usage: node skill-install.cjs <bundle-path> [--signature <sig>] [--dry-run] [--force] [--trust-threshold <n>]'
      );
      process.exit(3);
    }
    if (!opts.signature) {
      console.error('Error: --signature <hex> is required');
      process.exit(3);
    }

    const result = await installSkill(opts);
    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'signature-invalid') process.exit(1);
    if (result.status === 'refused') process.exit(2);
    process.exit(0);
  })();
}

module.exports = { installSkill };
