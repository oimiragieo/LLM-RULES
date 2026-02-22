'use strict';
/**
 * Scoped Semver Diff (Track 4.2)
 *
 * Compares semver strings and classifies the type of version change.
 * Also provides content-based bump computation for artifact diffs.
 * Pure synchronous module — no async, no file I/O.
 *
 * Corrections applied:
 *  - No raw JSON.parse on user input (pure string processing)
 *  - SE-04: no await-in-forEach (fully sync)
 *
 * API:
 *   parseSemver(str)                            → { major, minor, patch, valid }
 *   classifyChange(from, to)                    → 'major'|'minor'|'patch'|'none'|'downgrade'|'unknown'
 *   computeSemverDiff(from, to)                 → { from, to, changeType, majorDelta, minorDelta, patchDelta }
 *   computeSemverBump(oldContent, newContent, artifactType) → 'major'|'minor'|'patch'
 */

const { safeParseJSON } = require('../utils/safe-json.cjs');

const BUMP_PARSE_ERROR = Object.freeze({ __semverBumpParseError: true });

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

/**
 * Extract the tools array from YAML frontmatter of a skill/agent markdown file.
 * Handles inline `tools: [A, B]` and block-list `tools:\n  - A` styles.
 *
 * @param {string} content
 * @returns {string[]|null} Array of tool names, or null if no frontmatter / no tools key.
 */
function extractFrontmatterTools(content) {
  if (typeof content !== 'string') return null;
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];

  // Inline empty: tools: []
  if (/^tools:\s*\[\s*\]/m.test(fm)) return [];

  // Inline array: tools: [Read, Write]
  const inlineMatch = fm.match(/^tools:\s*\[([^\]]+)\]/m);
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Block list: tools:\n  - Read\n  - Write
  const blockMatch = fm.match(/^tools:\s*\r?\n((?:[ \t]+-[ \t]+\S[^\r\n]*\r?\n?)+)/m);
  if (blockMatch) {
    const items = blockMatch[1].match(/[ \t]+-[ \t]+(\S[^\r\n]*)/g);
    if (items) {
      return items.map(s => s.replace(/^[ \t]+-[ \t]+/, '').trim());
    }
  }

  return null;
}

/**
 * Compute required semver bump from comparing YAML-frontmatter tools arrays.
 *
 * @param {string} oldContent
 * @param {string} newContent
 * @returns {'major'|'minor'|'patch'}
 */
function computeFrontmatterBump(oldContent, newContent) {
  const oldTools = extractFrontmatterTools(oldContent);
  const newTools = extractFrontmatterTools(newContent);

  if (oldTools === null && newTools === null) return 'patch';
  if (oldTools === null && newTools !== null) return 'minor';
  if (oldTools !== null && newTools === null) return 'major';

  const oldSet = new Set(oldTools);
  const newSet = new Set(newTools);

  for (const tool of oldSet) {
    if (!newSet.has(tool)) return 'major';
  }
  for (const tool of newSet) {
    if (!oldSet.has(tool)) return 'minor';
  }
  return 'patch';
}

/**
 * Compute required semver bump from comparing JSON schema content.
 * Rules: required[] change → major; type change → major; new optional prop → minor; else → patch.
 * Falls back to 'patch' when either side is invalid JSON.
 *
 * @param {string} oldContent
 * @param {string} newContent
 * @returns {'major'|'minor'|'patch'}
 */
function computeSchemaBump(oldContent, newContent) {
  const oldSchema = safeParseJSON(oldContent, null, null, BUMP_PARSE_ERROR);
  const newSchema = safeParseJSON(newContent, null, null, BUMP_PARSE_ERROR);

  if (oldSchema === BUMP_PARSE_ERROR || newSchema === BUMP_PARSE_ERROR) return 'patch';

  const oldRequired = new Set(Array.isArray(oldSchema.required) ? oldSchema.required : []);
  const newRequired = new Set(Array.isArray(newSchema.required) ? newSchema.required : []);

  if (oldRequired.size !== newRequired.size) return 'major';
  for (const key of oldRequired) {
    if (!newRequired.has(key)) return 'major';
  }

  const oldProps =
    oldSchema.properties && typeof oldSchema.properties === 'object'
      ? oldSchema.properties
      : Object.create(null);
  const newProps =
    newSchema.properties && typeof newSchema.properties === 'object'
      ? newSchema.properties
      : Object.create(null);

  const oldPropKeys = Object.keys(oldProps);
  const newPropKeys = Object.keys(newProps);

  for (const key of oldPropKeys) {
    if (newPropKeys.includes(key)) {
      const oldType = oldProps[key] && oldProps[key].type;
      const newType = newProps[key] && newProps[key].type;
      if (oldType !== newType) return 'major';
    }
  }

  for (const key of newPropKeys) {
    if (!oldPropKeys.includes(key)) return 'minor';
  }

  return 'patch';
}

/**
 * Compute the required semver bump for a content-level diff between two artifact files.
 *
 * For skill/agent artifacts (YAML frontmatter):
 *   - tools[] item removed → 'major'
 *   - tools[] item added  → 'minor'
 *   - no structural change → 'patch'
 *
 * For schema artifacts (JSON):
 *   - required[] changed in any direction → 'major'
 *   - property type changed → 'major'
 *   - optional property added → 'minor'
 *   - no structural change → 'patch'
 *   - invalid JSON (either side) → 'patch' (safe fallback)
 *
 * @param {string} oldContent - Raw string content of the old artifact file
 * @param {string} newContent - Raw string content of the new artifact file
 * @param {string} artifactType - 'skill'|'agent'|'schema'|...
 * @returns {'major'|'minor'|'patch'}
 */
function computeSemverBump(oldContent, newContent, artifactType) {
  if (artifactType === 'schema') {
    return computeSchemaBump(oldContent, newContent);
  }
  return computeFrontmatterBump(oldContent, newContent);
}

module.exports = {
  parseSemver,
  classifyChange,
  computeSemverDiff,
  computeSemverBump,
};
