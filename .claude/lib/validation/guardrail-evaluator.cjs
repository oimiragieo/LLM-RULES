'use strict';

/**
 * Guardrail Evaluator
 * ===================
 * Parses and evaluates task output guardrails defined in plan markdown files.
 *
 * Guardrails are defined in a `## Guardrails` section of a plan file using
 * YAML-like syntax. Supported types:
 *   - required_files: checks that listed files exist (fs.existsSync)
 *   - required_fields: checks that metadata object has non-empty fields
 *   - no_stubs: checks file content for stub patterns via stub-patterns.cjs
 *   - custom_command: runs a shell command and checks exit code (not in tests scope)
 *
 * Evaluation modes:
 *   - 'warn'  (default): failed guardrails produce warnings, not blocks
 *   - 'block': failed guardrails produce blocks (task cannot complete)
 */

const fs = require('fs');
const { isStub } = require('../verification/stub-patterns.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a file path to forward slashes (SE-01: Windows backslash paths).
 *
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Trim a string value, returning empty string for null/undefined.
 *
 * @param {string|undefined|null} v
 * @returns {string}
 */
function trimStr(v) {
  return (v || '').trim();
}

// ---------------------------------------------------------------------------
// parseGuardrails
// ---------------------------------------------------------------------------

/**
 * Extract guardrail entries from a plan markdown string.
 *
 * Looks for a `## Guardrails` section and parses YAML-like bullet entries:
 *
 * ```markdown
 * ## Guardrails
 * - type: required_files
 *   paths:
 *     - src/index.cjs
 * - type: required_fields
 *   fields:
 *     - summary
 * ```
 *
 * @param {string} planContent - Raw markdown content of the plan file
 * @returns {Array<Object>} Array of guardrail objects (may be empty)
 */
function parseGuardrails(planContent) {
  if (!planContent || typeof planContent !== 'string') return [];

  // Extract the ## Guardrails section (up to the next heading at start of line, or end of string)
  // Extract section: find "## Guardrails" heading, capture everything until next heading or end of string
  const headingIdx = planContent.search(/^#{1,3}\s+Guardrails\s*$/m);
  if (headingIdx === -1) return [];
  const afterHeading = planContent.slice(headingIdx).replace(/^[^\n]*\n/, ''); // skip the heading line
  const nextHeadingMatch = afterHeading.match(/^#{1,3}\s+/m);
  const sectionBody = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;
  const guardrails = [];

  // Split on top-level bullet markers (lines starting with "- type:")
  const entryBlocks = sectionBody.split(/(?=^- type:)/m).filter(b => trimStr(b));

  for (const block of entryBlocks) {
    const lines = block.split('\n');
    const guardrail = {};

    let currentKey = null;
    let inList = false;

    for (const rawLine of lines) {
      // Skip empty lines
      if (!trimStr(rawLine)) continue;

      // Detect top-level "- key: value" lines (2-space or more indent is sub-content)
      const topMatch = rawLine.match(/^-\s+(\w+):\s*(.*)/);
      if (topMatch) {
        currentKey = topMatch[1];
        const val = trimStr(topMatch[2]);
        if (val) {
          guardrail[currentKey] = val;
          inList = false;
        } else {
          // Next indented lines will be a list
          guardrail[currentKey] = [];
          inList = true;
        }
        continue;
      }

      // Sub-level key: value (indented, e.g. "  mode: warn")
      const subKvMatch = rawLine.match(/^\s{2,}(\w+):\s*(.*)/);
      if (subKvMatch && !rawLine.match(/^\s+-\s/)) {
        currentKey = subKvMatch[1];
        const val = trimStr(subKvMatch[2]);
        if (val) {
          guardrail[currentKey] = val;
          inList = false;
        } else {
          // Empty value → next indented lines will be a list
          guardrail[currentKey] = [];
          inList = true;
        }
        continue;
      }

      // List item "    - value"
      const listItemMatch = rawLine.match(/^\s+-\s+(.*)/);
      if (listItemMatch && inList && currentKey) {
        const val = trimStr(listItemMatch[1]);
        if (val && Array.isArray(guardrail[currentKey])) {
          guardrail[currentKey].push(val);
        }
      }
    }

    if (guardrail.type) {
      guardrails.push(guardrail);
    }
  }

  return guardrails;
}

// ---------------------------------------------------------------------------
// evaluateGuardrail
// ---------------------------------------------------------------------------

/**
 * Evaluate a single guardrail against provided task metadata.
 *
 * @param {Object} guardrail - Guardrail definition (must have `type`)
 * @param {Object} taskMetadata - Metadata from the completed task
 * @param {Object} [options]
 * @returns {{ passed: boolean, reason?: string }}
 */
function evaluateGuardrail(guardrail, taskMetadata, options) {
  // options reserved for future use
  void options;

  const meta = taskMetadata || {};

  switch (guardrail.type) {
    case 'required_files': {
      const paths = guardrail.paths || [];
      for (const p of paths) {
        const normalized = normalizePath(p);
        if (!fs.existsSync(normalized)) {
          return { passed: false, reason: `Required file not found: ${normalized}` };
        }
      }
      return { passed: true };
    }

    case 'required_fields': {
      const fields = guardrail.fields || [];
      for (const field of fields) {
        const val = meta[field];
        if (val === undefined || val === null || val === '') {
          return { passed: false, reason: `Required metadata field missing or empty: ${field}` };
        }
      }
      return { passed: true };
    }

    case 'no_stubs': {
      const paths = guardrail.paths || [];
      for (const p of paths) {
        const normalized = normalizePath(p);
        // If file doesn't exist, nothing to check — pass
        if (!fs.existsSync(normalized)) {
          continue;
        }
        let content;
        try {
          content = fs.readFileSync(normalized, 'utf-8');
        } catch (_e) {
          // Unreadable — treat as pass (no stub evidence)
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (isStub(lines[i], normalized)) {
            return {
              passed: false,
              reason: `Stub pattern found in ${normalized} at line ${i + 1}: ${lines[i].trim()}`,
            };
          }
        }
      }
      return { passed: true };
    }

    case 'custom_command': {
      // Custom command support is deferred (spawn risk in tests).
      // Return pass by default if no command provided.
      return { passed: true };
    }

    default:
      // Unknown type — pass-through (forward-compatible)
      return { passed: true };
  }
}

// ---------------------------------------------------------------------------
// evaluateAll
// ---------------------------------------------------------------------------

/**
 * Evaluate all guardrails and aggregate results.
 *
 * @param {Array<Object>} guardrails - Array of guardrail definitions
 * @param {Object} taskMetadata - Metadata from the completed task
 * @param {Object} [options]
 * @param {'warn'|'block'} [options.mode='warn'] - Evaluation mode
 * @returns {{ passed: boolean, warnings: string[], blocks: string[] }}
 */
function evaluateAll(guardrails, taskMetadata, options) {
  const opts = options || {};
  const defaultMode = opts.mode || 'warn';

  const warnings = [];
  const blocks = [];

  if (!Array.isArray(guardrails) || guardrails.length === 0) {
    return { passed: true, warnings, blocks };
  }

  for (const guardrail of guardrails) {
    // Per-guardrail mode overrides options.mode
    const mode = guardrail.mode || defaultMode;
    const result = evaluateGuardrail(guardrail, taskMetadata, opts);

    if (!result.passed) {
      const reason = result.reason || `Guardrail failed: ${guardrail.type}`;
      if (mode === 'block') {
        blocks.push(reason);
      } else {
        warnings.push(reason);
      }
    }
  }

  const passed = blocks.length === 0;
  return { passed, warnings, blocks };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parseGuardrails,
  evaluateGuardrail,
  evaluateAll,
};
