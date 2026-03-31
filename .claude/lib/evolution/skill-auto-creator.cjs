#!/usr/bin/env node
'use strict';

/**
 * skill-auto-creator.cjs
 * ======================
 *
 * Automatic skill creation from session transcripts.
 *
 * Analyzes a session transcript (array of tool-call entries), identifies
 * novel procedures (sequences of 5+ tool calls with error-recovery patterns
 * not covered by existing skills), and generates a SKILL.md file.
 *
 * Security: generated content is scanned for embedded secrets and injection
 * patterns before writing. Schema validation runs before any write.
 *
 * Exports:
 *   analyzeTranscript(transcript, existingSkills, options?)
 *   → { written: boolean, path?: string, skipped?: boolean, reason?: string, error?: string }
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { validateData } = require('../utils/schema-validator.cjs');
const { redactSecrets } = require('../utils/redact-secrets.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'skill-definition.schema.json');

const DEFAULT_SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

/** Minimum number of tool calls to constitute a notable procedure. */
const MIN_PROCEDURE_LENGTH = 5;

/** Jaccard similarity threshold above which two step sequences are considered the same procedure. */
const SIMILARITY_THRESHOLD = 0.7;

/**
 * Patterns that constitute injection risks in generated SKILL.md content.
 * These are YAML-specific injection vectors and dangerous payload indicators.
 */
const YAML_INJECTION_PATTERNS = [/!!python\//, /!!ruby\//, /!!js\//, /!!binary/, /!!map/, /!!seq/];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract a normalised tool call sequence from a transcript.
 *
 * @param {Array<{toolName:string, success?:boolean, error?:any}>} transcript
 * @returns {Array<{toolName:string, success:boolean, error:string|null}>}
 */
function _extractToolSequence(transcript) {
  if (!Array.isArray(transcript)) return [];
  return transcript
    .filter(entry => entry != null && typeof entry.toolName === 'string' && entry.toolName !== '')
    .map(entry => ({
      toolName: entry.toolName,
      success: entry.success !== false && entry.error == null,
      error: entry.error ? String(entry.error) : null,
    }));
}

/**
 * Detect the error-recovery pattern: at least one failed call followed by
 * a successful call of the same or different tool.
 *
 * @param {Array<{toolName:string, success:boolean}>} toolSequence
 * @returns {boolean}
 */
function _hasErrorRecoveryPattern(toolSequence) {
  for (let i = 0; i < toolSequence.length - 1; i++) {
    if (!toolSequence[i].success && toolSequence[i + 1].success) {
      return true;
    }
  }
  return false;
}

/**
 * Compute Jaccard similarity between two string arrays.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0–1
 */
function _jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Extract step arrays (tool name lists) from existingSkills entries.
 *
 * existingSkills entries may be:
 *   - { steps: string[] }   – array of tool names
 *   - { toolNames: string[] }
 *   - { name: string }      – name only (no step info; ignored for similarity)
 *   - string                – name only (ignored for similarity)
 *
 * @param {Array} existingSkills
 * @returns {string[][]}
 */
function _getExistingSkillSteps(existingSkills) {
  if (!Array.isArray(existingSkills)) return [];
  return existingSkills
    .map(skill => {
      if (skill == null || typeof skill === 'string') return null;
      if (Array.isArray(skill.steps)) return skill.steps;
      if (Array.isArray(skill.toolNames)) return skill.toolNames;
      return null;
    })
    .filter(Boolean);
}

/**
 * Derive a safe, lowercase-with-hyphens skill name from the tool sequence.
 *
 * @param {Array<{toolName:string}>} toolSequence
 * @returns {string}
 */
function _generateSkillName(toolSequence) {
  const toolCounts = /** @type {Record<string,number>} */ ({});
  for (const { toolName } of toolSequence) {
    const lower = toolName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    toolCounts[lower] = (toolCounts[lower] || 0) + 1;
  }
  const dominant = Object.entries(toolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([name]) => name.replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .join('-');
  return `auto-${dominant}-workflow`.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Convert a slug like "auto-read-edit-workflow" to "Auto Read Edit Workflow".
 *
 * @param {string} slug
 * @returns {string}
 */
function _toTitleCase(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Generate SKILL.md content from a tool sequence.
 *
 * @param {Array<{toolName:string, success:boolean, error:string|null}>} toolSequence
 * @param {object} opts
 * @param {string} [opts.skillName]
 * @returns {string}
 */
function _generateSkillContent(toolSequence, opts) {
  const name = opts && opts.skillName ? opts.skillName : _generateSkillName(toolSequence);
  const uniqueToolNames = [...new Set(toolSequence.map(t => t.toolName))];
  const description =
    `Automatically extracted procedure using ${uniqueToolNames.join(', ')}. ` +
    `Multi-step workflow with error recovery.`;

  const triggers = uniqueToolNames.slice(0, 3).map(t => t.toLowerCase());

  // Build frontmatter using yaml.dump for proper escaping
  const frontmatterObj = {
    name,
    description,
    version: '1.0.0',
    triggers,
  };
  const yamlStr = yaml.dump(frontmatterObj, { lineWidth: 200, quotingType: '"' });

  // Build rules section from tool sequence
  const rules = toolSequence
    .map((t, i) => {
      const suffix = !t.success ? ' — retry on failure' : '';
      return `${i + 1}. Use \`${t.toolName}\`${suffix}.`;
    })
    .join('\n');

  const title = _toTitleCase(name);

  return `---\n${yamlStr}---\n\n# ${title}\n\n## Rules\n\n${rules}\n`;
}

/**
 * Parse YAML frontmatter from a Markdown string.
 *
 * @param {string} content
 * @returns {object|null}
 */
function _parseFrontmatter(content) {
  if (typeof content !== 'string' || !content.startsWith('---')) return null;

  // Find the closing delimiter on its own line
  const afterOpener = content.slice(3);
  const closeMatch = afterOpener.match(/\n---[ \t]*(\n|$)/);
  if (!closeMatch) return null;

  const yamlStr = afterOpener.slice(0, closeMatch.index);
  try {
    const parsed = yaml.load(yamlStr);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Return true if the content contains an embedded secret detected by redactSecrets.
 *
 * @param {string} content
 * @returns {boolean}
 */
function _containsSecrets(content) {
  const redacted = redactSecrets(content);
  return redacted !== content;
}

/**
 * Return true if the content contains YAML injection patterns.
 *
 * @param {string} content
 * @returns {boolean}
 */
function _containsInjection(content) {
  for (const pattern of YAML_INJECTION_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a session transcript and write a SKILL.md when a novel procedure
 * is detected.
 *
 * @param {Array<{toolName:string, success?:boolean, error?:any}>} transcript
 *   Array of tool-call entries from the session.
 * @param {Array<{name?:string, steps?:string[], toolNames?:string[]}>} existingSkills
 *   Existing skills used for idempotency checking.
 * @param {object} [options]
 * @param {string}   [options.outputDir]          Override the skills directory.
 * @param {string}   [options.skillName]          Override the generated skill name.
 * @param {boolean}  [options.dryRun]             Skip writing even if all checks pass.
 * @param {Function} [options._contentGenerator]  Test hook: replace the SKILL.md generator.
 * @returns {{ written: boolean, path?: string, skipped?: boolean, reason?: string, error?: string }}
 */
function analyzeTranscript(transcript, existingSkills, options) {
  const opts = options != null && typeof options === 'object' ? options : {};

  // ── 1. Extract tool sequence ───────────────────────────────────────────
  const toolSequence = _extractToolSequence(transcript);

  // ── 2. Minimum length check ────────────────────────────────────────────
  if (toolSequence.length < MIN_PROCEDURE_LENGTH) {
    return {
      written: false,
      skipped: true,
      reason:
        `Transcript has only ${toolSequence.length} tool call(s) ` +
        `(minimum: ${MIN_PROCEDURE_LENGTH})`,
    };
  }

  // ── 3. Error-recovery pattern check ───────────────────────────────────
  if (!_hasErrorRecoveryPattern(toolSequence)) {
    return {
      written: false,
      skipped: true,
      reason: 'No error-recovery pattern detected in transcript',
    };
  }

  // ── 4. Idempotency check against existing skills ───────────────────────
  const existingStepArrays = _getExistingSkillSteps(existingSkills);
  const currentToolNames = toolSequence.map(t => t.toolName);
  for (const existingSteps of existingStepArrays) {
    const sim = _jaccard(currentToolNames, existingSteps);
    if (sim >= SIMILARITY_THRESHOLD) {
      return {
        written: false,
        skipped: true,
        reason: `Procedure matches existing skill with ${Math.round(sim * 100)}% step-sequence similarity`,
      };
    }
  }

  // ── 5. Generate SKILL.md content ───────────────────────────────────────
  const contentGenerator =
    typeof opts._contentGenerator === 'function' ? opts._contentGenerator : _generateSkillContent;

  let content;
  try {
    content = contentGenerator(toolSequence, opts);
  } catch (err) {
    return { written: false, error: `Content generation failed: ${err.message}` };
  }

  if (!content || typeof content !== 'string') {
    return { written: false, error: 'Content generator returned empty or invalid content' };
  }

  // ── 6. Non-empty rules section check ──────────────────────────────────
  const rulesMatch = content.match(/##\s+Rules\s*\n([\s\S]*?)(?:\n##|\n---|\n$|$)/);
  const rulesBody = rulesMatch ? rulesMatch[1].trim() : '';
  if (!rulesBody) {
    return { written: false, error: 'Generated SKILL.md is missing a non-empty Rules section' };
  }

  // ── 7. Schema validation ───────────────────────────────────────────────
  const frontmatter = _parseFrontmatter(content);
  if (!frontmatter) {
    return { written: false, error: 'Generated SKILL.md has invalid YAML frontmatter' };
  }

  const validationResult = validateData(frontmatter, SCHEMA_PATH);
  if (!validationResult.valid && !validationResult.skipped) {
    const details = (validationResult.errors || []).map(e => `${e.path}: ${e.message}`).join('; ');
    return { written: false, error: `Schema validation failed: ${details}` };
  }

  // ── 8. Security scan ──────────────────────────────────────────────────
  if (_containsSecrets(content)) {
    return { written: false, error: 'Generated content contains embedded secrets' };
  }

  if (_containsInjection(content)) {
    return { written: false, error: 'Generated content contains YAML injection patterns' };
  }

  // ── 9. Dry-run short-circuit ───────────────────────────────────────────
  if (opts.dryRun) {
    return { written: false, skipped: true, reason: 'Dry run mode — no file written' };
  }

  // ── 10. Determine output path ─────────────────────────────────────────
  const skillsDir = typeof opts.outputDir === 'string' ? opts.outputDir : DEFAULT_SKILLS_DIR;
  const skillName = /** @type {string} */ (frontmatter.name);
  const skillDir = path.join(skillsDir, skillName);
  const skillPath = path.join(skillDir, 'SKILL.md');

  // File-level idempotency: skip if already exists
  if (fs.existsSync(skillPath)) {
    return {
      written: false,
      skipped: true,
      reason: `Skill file already exists at ${skillPath}`,
    };
  }

  // ── 11. Write file ────────────────────────────────────────────────────
  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, content, 'utf8');
  } catch (err) {
    return { written: false, error: `Failed to write SKILL.md: ${err.message}` };
  }

  return { written: true, path: skillPath };
}

module.exports = {
  analyzeTranscript,
  // Exported for unit-testing internals
  _extractToolSequence,
  _hasErrorRecoveryPattern,
  _jaccard,
  _parseFrontmatter,
  _generateSkillName,
  _generateSkillContent,
  _containsSecrets,
  _containsInjection,
};
