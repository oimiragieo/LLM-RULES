'use strict';

/**
 * Agent Fingerprinting Utility
 *
 * Generates deterministic UUID v5 fingerprints for agent IDs.
 * Uses SHA-1 hashing with a fixed DNS namespace UUID per RFC 4122.
 *
 * Namespace: 6ba7b810-9dad-11d1-80b4-00c04fd430c8 (DNS namespace)
 * Name format: "agent-studio:<agentId>"
 *
 * @module agent-fingerprint
 */

const crypto = require('crypto');

/**
 * Fixed DNS namespace UUID bytes (6ba7b810-9dad-11d1-80b4-00c04fd430c8)
 * @type {Buffer}
 */
const DNS_NAMESPACE = Buffer.from([
  0x6b,
  0xa7,
  0xb8,
  0x10, // time_low
  0x9d,
  0xad, // time_mid
  0x11,
  0xd1, // time_hi_and_version
  0x80,
  0xb4, // clock_seq
  0x00,
  0xc0,
  0x4f,
  0xd4,
  0x30,
  0xc8, // node
]);

/**
 * Generate a UUID v5 fingerprint for an agent ID.
 *
 * UUID v5 algorithm per RFC 4122 §4.3:
 *   1. Concatenate namespace bytes + name bytes
 *   2. Hash with SHA-1
 *   3. Set version bits (nibble 7 of time_hi = 0x50 | nibble)
 *   4. Set variant bits (octet 8: 10xxxxxx)
 *   5. Format as xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *
 * @param {string} agentId - The agent identifier (e.g. "developer", "qa")
 * @returns {string} UUID v5 string in canonical form
 */
function generateAgentFingerprint(agentId) {
  if (typeof agentId !== 'string' || agentId.length === 0) {
    throw new TypeError('agentId must be a non-empty string');
  }

  const nameBytes = Buffer.from(`agent-studio:${agentId}`, 'utf8');

  // M-03: non-security use (cache key / content addressing / UUID namespace); MD5/SHA-1 acceptable
  // SHA-1 hash of (namespace || name)
  const hash = crypto.createHash('sha1').update(DNS_NAMESPACE).update(nameBytes).digest();

  // Set version: nibble 13 (bits 76-79 of octet 6) = 0101 (5)
  hash[6] = (hash[6] & 0x0f) | 0x50;

  // Set variant: bits 6-7 of octet 8 = 10
  hash[8] = (hash[8] & 0x3f) | 0x80;

  // Format as UUID string: 4-2-2-2-6 byte groups
  const hex = hash.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

module.exports = { generateAgentFingerprint };
