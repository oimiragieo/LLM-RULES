'use strict';

/**
 * mention-parser.cjs — Parse GitHub issue/PR comment bodies for @agent-studio mentions.
 *
 * Scans comment text for `@agent-studio` mentions, extracts the instruction text
 * that follows each mention, and ignores any mentions that appear inside fenced
 * code blocks (``` ... ```).
 *
 * Usage:
 *   const { MentionParser } = require('.claude/lib/github/mention-parser.cjs');
 *   const parser = new MentionParser();
 *   const mentions = parser.parse('@agent-studio please review this PR');
 *   // => [{ mention: '@agent-studio', instruction: 'please review this PR', position: 0 }]
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENTION = '@agent-studio';
const MENTION_LEN = MENTION.length;

// ---------------------------------------------------------------------------
// MentionParser class
// ---------------------------------------------------------------------------

class MentionParser {
  /**
   * Parse a GitHub comment body for `@agent-studio` mentions.
   *
   * Rules:
   * - Scans for every occurrence of `@agent-studio` in the text.
   * - Ignores occurrences that fall inside fenced code blocks (``` ... ```).
   * - For each valid mention, extracts the instruction text that follows it
   *   (up to the next valid mention or the end of the text), then trims it.
   * - Returns results in order of appearance.
   *
   * @param {string} commentBody - The full comment text to parse.
   * @returns {Array<{mention: string, instruction: string, position: number}>}
   *   One entry per valid `@agent-studio` mention, with:
   *   - `mention`     — always `'@agent-studio'`
   *   - `instruction` — text following the mention, trimmed of whitespace
   *   - `position`    — zero-based index of the `@` character in `commentBody`
   */
  parse(commentBody) {
    if (!commentBody || typeof commentBody !== 'string') {
      return [];
    }

    // ------------------------------------------------------------------
    // Step 1: Identify fenced code block ranges so we can exclude them.
    // Matches  ```...```  (triple-backtick, content may span multiple lines).
    // ------------------------------------------------------------------
    const codeBlockRanges = [];
    const fencedRegex = /```[\s\S]*?```/g;
    let cbMatch;
    while ((cbMatch = fencedRegex.exec(commentBody)) !== null) {
      codeBlockRanges.push([cbMatch.index, cbMatch.index + cbMatch[0].length]);
    }

    /**
     * Return true if `pos` falls inside any detected code block.
     * @param {number} pos
     * @returns {boolean}
     */
    function insideCodeBlock(pos) {
      return codeBlockRanges.some(([start, end]) => pos >= start && pos < end);
    }

    // ------------------------------------------------------------------
    // Step 2: Find all @agent-studio occurrences that are NOT in code blocks.
    // ------------------------------------------------------------------
    const mentionRegex = /@agent-studio/g;
    const validPositions = [];
    let mMatch;
    while ((mMatch = mentionRegex.exec(commentBody)) !== null) {
      if (!insideCodeBlock(mMatch.index)) {
        validPositions.push(mMatch.index);
      }
    }

    // ------------------------------------------------------------------
    // Step 3: For each valid mention, extract the instruction text.
    // The instruction spans from just after `@agent-studio` to the start of
    // the next valid mention (or the end of the string), trimmed.
    // ------------------------------------------------------------------
    return validPositions.map((position, idx) => {
      const instructionStart = position + MENTION_LEN;
      const instructionEnd =
        idx < validPositions.length - 1 ? validPositions[idx + 1] : commentBody.length;
      const instruction = commentBody.slice(instructionStart, instructionEnd).trim();

      return { mention: MENTION, instruction, position };
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { MentionParser };
