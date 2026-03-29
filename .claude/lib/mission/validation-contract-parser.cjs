'use strict';

/**
 * Validation Contract Parser
 *
 * Parses validation-contract.md markdown into executable check objects.
 * Extracts rules matching ### VAL-{AREA}-{NNN}: {title} pattern.
 *
 * Each rule gets: id, title, description, evidence, line
 * Returns {success, rules[], errors[], warnings[]}
 *
 * Duplicate IDs detected and rejected with DUPLICATE_ID error.
 * Malformed markdown degrades gracefully: parseable rules extracted,
 * broken rules produce structured errors with line numbers.
 */

const fs = require('node:fs');
const path = require('node:path');

// Pattern for rule headers: ### VAL-{AREA}-{NNN}: {title}
// AREA is uppercase letters and/or digits (e.g., MC, E2E, CROSS)
// NNN is digits
const RULE_HEADER_PATTERN = /^### (VAL-[A-Z0-9]+-\d+):\s*(.+)$/;

// Pattern for Evidence line
const EVIDENCE_PATTERN = /^Evidence:\s*(.+)$/;

/**
 * Parse a validation contract markdown file
 *
 * @param {string} contractPath - Path to the markdown contract file
 * @returns {Object} - {success: boolean, rules: [], errors: [], warnings: []}
 */
function parseValidationContract(contractPath) {
  const result = {
    success: true,
    rules: [],
    errors: [],
    warnings: [],
  };

  // Normalize path
  contractPath = path.normalize(contractPath);

  // Check file exists
  if (!fs.existsSync(contractPath)) {
    result.success = false;
    result.errors.push({
      code: 'FILE_NOT_FOUND',
      message: `Contract file not found: ${contractPath}`,
      details: { path: contractPath },
    });
    return result;
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(contractPath, 'utf8');
  } catch (readErr) {
    result.success = false;
    result.errors.push({
      code: 'READ_ERROR',
      message: `Failed to read contract file: ${readErr.message}`,
      details: { path: contractPath },
    });
    return result;
  }

  // Handle empty file
  if (!content || content.trim() === '') {
    // Empty file is valid, just no rules
    return result;
  }

  // Split into lines for parsing
  const lines = content.split('\n');

  // Track rule IDs for duplicate detection
  const ruleIdMap = new Map(); // id -> { line, title }
  const pendingRules = []; // Rules being built (not yet reached Evidence)

  // Current rule being parsed
  let currentRule = null;
  let currentDescriptionLines = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1; // 1-indexed

    // Check for rule header
    const headerMatch = line.match(RULE_HEADER_PATTERN);

    if (headerMatch) {
      // If we have a previous rule without Evidence, it's incomplete
      if (currentRule !== null) {
        // Previous rule is incomplete (no Evidence section)
        result.errors.push({
          code: 'MISSING_EVIDENCE',
          message: `Rule ${currentRule.id} at line ${currentRule.line} has no Evidence section`,
          line: currentRule.line,
          details: { id: currentRule.id, title: currentRule.title },
        });
        // Don't add incomplete rule to result.rules
        currentRule = null;
        currentDescriptionLines = [];
      }

      const id = headerMatch[1];
      const title = headerMatch[2].trim();

      // Start new rule
      currentRule = {
        id,
        title,
        description: '',
        evidence: '',
        line: lineNumber,
      };

      // Check for duplicate ID
      if (ruleIdMap.has(id)) {
        // We'll report duplicates at the end
      } else {
        ruleIdMap.set(id, { line: lineNumber, title });
      }

      currentDescriptionLines = [];
      continue;
    }

    // If we're in a rule, check for Evidence line or collect description
    if (currentRule !== null) {
      const evidenceMatch = line.match(EVIDENCE_PATTERN);

      if (evidenceMatch) {
        // Found Evidence section - complete the rule
        currentRule.evidence = evidenceMatch[1].trim();
        currentRule.description = currentDescriptionLines.join('\n').trim();

        // Add to rules
        result.rules.push(currentRule);
        pendingRules.push(currentRule);
        currentRule = null;
        currentDescriptionLines = [];
      } else if (line.startsWith('### ') || line.startsWith('## ')) {
        // Hit another header without finding Evidence - rule is incomplete
        result.errors.push({
          code: 'MISSING_EVIDENCE',
          message: `Rule ${currentRule.id} at line ${currentRule.line} has no Evidence section`,
          line: currentRule.line,
          details: { id: currentRule.id, title: currentRule.title },
        });
        currentRule = null;
        currentDescriptionLines = [];

        // Re-check this line for a new rule header
        lineIndex--;
      } else {
        // Collect description line
        currentDescriptionLines.push(line);
      }
    }
  }

  // Handle trailing rule without Evidence
  if (currentRule !== null) {
    result.errors.push({
      code: 'MISSING_EVIDENCE',
      message: `Rule ${currentRule.id} at line ${currentRule.line} has no Evidence section`,
      line: currentRule.line,
      details: { id: currentRule.id, title: currentRule.title },
    });
  }

  // Check for duplicates
  const duplicateIds = [];
  const seenIds = new Map();

  for (const rule of result.rules) {
    if (seenIds.has(rule.id)) {
      duplicateIds.push(rule.id);
    } else {
      seenIds.set(rule.id, true);
    }
  }

  // If duplicates found, report error and mark as failed
  if (duplicateIds.length > 0) {
    const uniqueDupIds = [...new Set(duplicateIds)];
    result.success = false;

    // Find all lines with duplicate IDs
    const dupLines = [];
    for (const [id, info] of ruleIdMap) {
      if (uniqueDupIds.includes(id)) {
        dupLines.push({ id, line: info.line, title: info.title });
      }
    }

    result.errors.unshift({
      code: 'DUPLICATE_ID',
      message: `Duplicate rule IDs found: ${uniqueDupIds.join(', ')}`,
      details: {
        duplicateIds: uniqueDupIds,
        lines: dupLines,
      },
    });
  }

  return result;
}

/**
 * Get a rule by ID from parsed result
 *
 * @param {Object} parseResult - Result from parseValidationContract
 * @param {string} ruleId - Rule ID to find
 * @returns {Object|null} - Rule object or null
 */
function getRuleById(parseResult, ruleId) {
  return parseResult.rules.find(r => r.id === ruleId) || null;
}

/**
 * Get all rule IDs from parsed result
 *
 * @param {Object} parseResult - Result from parseValidationContract
 * @returns {string[]} - Array of rule IDs
 */
function getRuleIds(parseResult) {
  return parseResult.rules.map(r => r.id);
}

/**
 * Check if contract has any errors
 *
 * @param {Object} parseResult - Result from parseValidationContract
 * @returns {boolean} - True if no errors
 */
function isValid(parseResult) {
  return parseResult.success && parseResult.errors.length === 0;
}

module.exports = {
  parseValidationContract,
  getRuleById,
  getRuleIds,
  isValid,
  RULE_HEADER_PATTERN,
  EVIDENCE_PATTERN,
};
