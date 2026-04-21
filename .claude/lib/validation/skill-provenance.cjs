/**
 * @file .claude/lib/validation/skill-provenance.cjs
 * @description Provenance field validator for SKILL.md frontmatter
 *
 * Validates ArXiv [2504.19951] + [2602.14798] provenance fields against tool-squatting.
 * Every SKILL.md must declare:
 *   - source: origin of the skill (builtin | community | plugin | external)
 *   - trust_score: integer in [0, 100] indicating reliability
 *   - provenance_sha: 16-char truncated SHA-256 hex of SKILL.md content
 *
 * Used by:
 *   - tests/validation/skill-provenance.test.cjs (test suite)
 *   - .claude/tools/cli/generate-skill-index.cjs (build-time validation)
 *   - .claude/tools/cli/skills-provenance-migrate.cjs (migration script)
 */

'use strict';

const crypto = require('crypto');

/**
 * Allowed values for the `source` provenance field.
 * @type {string[]}
 */
const VALID_SOURCES = ['builtin', 'community', 'plugin', 'external'];

/**
 * Compute the provenance_sha for a SKILL.md file content.
 * Returns the first 16 hex characters of the SHA-256 digest.
 *
 * @param {string} content - Raw UTF-8 content of the SKILL.md file
 * @returns {string} 16-character lowercase hex string
 */
function computeProvenanceSha(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Validate the provenance fields in a SKILL.md frontmatter object.
 *
 * @param {object} frontmatter - Parsed YAML frontmatter (key-value object)
 * @param {string} [filePath] - Optional file path for error messages
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSkillProvenance(frontmatter, filePath) {
  const errors = [];
  const loc = filePath ? ` (${filePath})` : '';

  // Validate `source`
  if (frontmatter.source === undefined || frontmatter.source === null) {
    errors.push(`Missing required field "source"${loc} — must be one of: ${VALID_SOURCES.join(', ')}`);
  } else if (!VALID_SOURCES.includes(frontmatter.source)) {
    errors.push(
      `Invalid source "${frontmatter.source}"${loc} — must be one of: ${VALID_SOURCES.join(', ')}`
    );
  }

  // Validate `trust_score`
  if (frontmatter.trust_score === undefined || frontmatter.trust_score === null) {
    errors.push(`Missing required field "trust_score"${loc} — must be an integer in [0, 100]`);
  } else {
    const score = Number(frontmatter.trust_score);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      errors.push(
        `Invalid trust_score "${frontmatter.trust_score}"${loc} — must be an integer in [0, 100]`
      );
    }
  }

  // Validate `provenance_sha`
  if (frontmatter.provenance_sha === undefined || frontmatter.provenance_sha === null) {
    errors.push(`Missing required field "provenance_sha"${loc} — must be a 16-char hex string`);
  } else if (
    typeof frontmatter.provenance_sha !== 'string' ||
    !/^[0-9a-f]{16}$/i.test(frontmatter.provenance_sha)
  ) {
    errors.push(
      `Invalid provenance_sha "${frontmatter.provenance_sha}"${loc} — must be a 16-char lowercase hex string`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all provenance fields across an array of scanned skill entries.
 * Returns a summary with per-skill errors.
 *
 * @param {Array<{ filePath: string, frontmatter: object }>} skills
 * @returns {{ valid: boolean, errors: Array<{ filePath: string, errors: string[] }> }}
 */
function validateAllSkillsProvenance(skills) {
  const failedSkills = [];

  for (const { filePath, frontmatter } of skills) {
    const result = validateSkillProvenance(frontmatter, filePath);
    if (!result.valid) {
      failedSkills.push({ filePath, errors: result.errors });
    }
  }

  return {
    valid: failedSkills.length === 0,
    errors: failedSkills,
  };
}

module.exports = {
  VALID_SOURCES,
  computeProvenanceSha,
  validateSkillProvenance,
  validateAllSkillsProvenance,
};
