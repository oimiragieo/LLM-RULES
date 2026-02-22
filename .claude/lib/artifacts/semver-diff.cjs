'use strict';
/**
 * Scoped Semver Diff (Track 4.2)
 *
 * Compares semver strings and classifies the type of version change.
 * Pure synchronous module — no async, no file I/O.
 *
 * Corrections applied:
 *  - No raw JSON.parse on user input (pure string processing)
 *  - SE-04: no await-in-forEach (fully sync)
 *
 * API:
 *   parseSemver(str)         → { major, minor, patch, valid }
 *   classifyChange(from, to) → 'major'|'minor'|'patch'|'none'|'downgrade'|'unknown'
 *   computeSemverDiff(from, to) → { from, to, changeType, majorDelta, minorDelta, patchDelta }
 */

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/;

/**
 * Parse a semver string into its components.
 *
 * @param {string|null|undefined} str
 * @returns {{ major: number, minor: number, patch: number, valid: boolean }}
 */
function parseSemver(str) {
  if (str == null || typeof str !== 'string' || str.trim() === '') {
    return { major: 0, minor: 0, patch: 0, valid: false };
  }
  const match = str.trim().match(SEMVER_RE);
  if (!match) return { major: 0, minor: 0, patch: 0, valid: false };
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    valid: true,
  };
}

/**
 * Classify the change between two parsed semver objects.
 *
 * @param {{ major: number, minor: number, patch: number, valid?: boolean }} from
 * @param {{ major: number, minor: number, patch: number, valid?: boolean }} to
 * @returns {'major'|'minor'|'patch'|'none'|'downgrade'|'unknown'}
 */
function classifyChange(from, to) {
  if (from.valid === false || to.valid === false) return 'unknown';

  if (to.major > from.major) return 'major';
  if (to.major < from.major) return 'downgrade';

  if (to.minor > from.minor) return 'minor';
  if (to.minor < from.minor) return 'downgrade';

  if (to.patch > from.patch) return 'patch';
  if (to.patch < from.patch) return 'downgrade';

  return 'none';
}

/**
 * Compute the full semver diff between two version strings.
 *
 * @param {string} fromStr - Old version (e.g. "1.2.3")
 * @param {string} toStr - New version (e.g. "2.0.0")
 * @returns {{
 *   from: string,
 *   to: string,
 *   changeType: 'major'|'minor'|'patch'|'none'|'downgrade'|'unknown',
 *   majorDelta: number,
 *   minorDelta: number,
 *   patchDelta: number,
 *   fromParsed: object,
 *   toParsed: object,
 * }}
 */
function computeSemverDiff(fromStr, toStr) {
  const from = parseSemver(fromStr);
  const to = parseSemver(toStr);
  const changeType = classifyChange(from, to);

  return {
    from: String(fromStr),
    to: String(toStr),
    changeType,
    majorDelta: to.major - from.major,
    minorDelta: to.minor - from.minor,
    patchDelta: to.patch - from.patch,
    fromParsed: from,
    toParsed: to,
  };
}

module.exports = {
  parseSemver,
  classifyChange,
  computeSemverDiff,
};
