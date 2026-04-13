// Agent: developer | Task: #2 | Session: 2026-04-13
'use strict';

/**
 * fixed-section-handler.cjs
 *
 * Shared utility for FIXED/EDITABLE section marker enforcement in updater skills.
 *
 * Marker syntax:
 *   <!-- FIXED: section-name -->   ...content...   <!-- /FIXED -->
 *   <!-- EDITABLE: section-name --> ...content...  <!-- /EDITABLE -->
 *
 * Pure functions — no file I/O. Callers handle reading/writing files.
 */

const FIXED_OPEN_RE = /<!-- FIXED:\s*(.*?)\s*-->/g;
const FIXED_CLOSE = '<!-- /FIXED -->';
const EDITABLE_OPEN_RE = /<!-- EDITABLE:\s*(.*?)\s*-->/g;
const EDITABLE_CLOSE = '<!-- /EDITABLE -->';

/**
 * @typedef {Object} Section
 * @property {string} name     - section name from the marker
 * @property {string} content  - full content including open/close tags
 * @property {number} start    - start index in the source string
 * @property {number} end      - end index in the source string (exclusive)
 */

/**
 * @typedef {Object} SectionMap
 * @property {Section[]} fixed    - FIXED sections
 * @property {Section[]} editable - EDITABLE sections
 * @property {{ content: string, start: number, end: number }[]} unmarked - text outside any markers
 */

/**
 * Parse FIXED and EDITABLE section markers out of content.
 *
 * @param {string} content
 * @returns {SectionMap}
 */
function extractSections(content) {
  if (!content) {
    return { fixed: [], editable: [], unmarked: [] };
  }

  const fixed = [];
  const editable = [];
  // Track which character ranges are covered by a marked section
  const coveredRanges = [];

  // Helper that extracts all blocks for a given open regex and close marker
  function extractBlocks(openRe, closeMarker, out) {
    const re = new RegExp(openRe.source, 'g');
    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1].trim();
      const blockStart = match.index;
      const closeIdx = content.indexOf(closeMarker, match.index + match[0].length);
      if (closeIdx === -1) {
        // Unclosed block — treat entire rest as content
        const blockContent = content.slice(blockStart);
        out.push({ name, content: blockContent, start: blockStart, end: content.length });
        coveredRanges.push([blockStart, content.length]);
      } else {
        const blockEnd = closeIdx + closeMarker.length;
        const blockContent = content.slice(blockStart, blockEnd);
        out.push({ name, content: blockContent, start: blockStart, end: blockEnd });
        coveredRanges.push([blockStart, blockEnd]);
      }
    }
  }

  extractBlocks(FIXED_OPEN_RE, FIXED_CLOSE, fixed);
  extractBlocks(EDITABLE_OPEN_RE, EDITABLE_CLOSE, editable);

  // Sort covered ranges to compute unmarked segments
  coveredRanges.sort((a, b) => a[0] - b[0]);

  const unmarked = [];
  let pos = 0;
  for (const [start, end] of coveredRanges) {
    if (pos < start) {
      const seg = content.slice(pos, start);
      if (seg.trim()) {
        unmarked.push({ content: seg, start: pos, end: start });
      }
    }
    pos = end;
  }
  if (pos < content.length) {
    const seg = content.slice(pos);
    if (seg.trim()) {
      unmarked.push({ content: seg, start: pos, end: content.length });
    }
  }

  return { fixed, editable, unmarked };
}

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {{ sectionName: string, reason: string }[]} violations
 */

/**
 * Validate that all FIXED sections from originalContent are preserved
 * (with identical content) in updatedContent.
 *
 * @param {string} originalContent
 * @param {string} updatedContent
 * @returns {ValidationResult}
 */
function validateFixedPreserved(originalContent, updatedContent) {
  const originalSections = extractSections(originalContent);
  const updatedSections = extractSections(updatedContent);

  /** @type {{ sectionName: string, reason: string }[]} */
  const violations = [];

  for (const origSection of originalSections.fixed) {
    const matchInUpdated = updatedSections.fixed.find(s => s.name === origSection.name);
    if (!matchInUpdated) {
      violations.push({
        sectionName: origSection.name,
        reason: `FIXED section "${origSection.name}" is missing from updated content`,
      });
      continue;
    }
    if (matchInUpdated.content !== origSection.content) {
      violations.push({
        sectionName: origSection.name,
        reason: `FIXED section "${origSection.name}" content was modified`,
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Apply updatedContent while restoring any FIXED sections from originalContent
 * that were modified or removed.
 *
 * Strategy:
 *   1. For each FIXED section in original, find it in updated.
 *   2. If found with different content → replace the updated version with original.
 *   3. If missing from updated → prepend the original block to the result.
 *
 * @param {string} originalContent
 * @param {string} updatedContent
 * @returns {string} merged content
 */
function applyUpdatePreservingFixed(originalContent, updatedContent) {
  const originalSections = extractSections(originalContent);

  if (originalSections.fixed.length === 0) {
    // Nothing to enforce — return updated as-is
    return updatedContent;
  }

  const updatedSections = extractSections(updatedContent);
  let result = updatedContent;

  const missingBlocks = [];

  for (const origSection of originalSections.fixed) {
    const matchInUpdated = updatedSections.fixed.find(s => s.name === origSection.name);

    if (!matchInUpdated) {
      // Section was removed — collect to prepend later
      missingBlocks.push(origSection.content);
      continue;
    }

    if (matchInUpdated.content !== origSection.content) {
      // Section was modified — replace with original version
      result = result.replace(matchInUpdated.content, origSection.content);
    }
    // If content is identical, nothing to do
  }

  // Prepend any missing FIXED sections at the top of the result
  if (missingBlocks.length > 0) {
    result = missingBlocks.join('\n') + '\n' + result;
  }

  return result;
}

module.exports = {
  extractSections,
  validateFixedPreserved,
  applyUpdatePreservingFixed,
};
