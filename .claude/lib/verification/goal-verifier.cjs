'use strict';

/**
 * Goal-Backward Verification
 *
 * Provides functions to verify that a completed task actually achieved its goals:
 * - checkTruths: runs shell commands to verify facts
 * - checkArtifacts: checks that expected files exist
 * - checkWiring: checks that expected patterns appear in files
 * - detectStubs: scans source files for stub/placeholder markers
 * - parseMustHaves: extracts must_have checklist items from a plan markdown
 */

const { isStub, STUB_PATTERNS } = require('./stub-patterns.cjs');

// ------------------------------------------------------------------
// checkTruths
// ------------------------------------------------------------------

/**
 * Run shell commands to verify truths.
 *
 * @param {Array<{description: string, command: string}>} truths
 * @param {{ exec?: Function }} [deps] - Injectable dependencies for testing
 * @returns {{ passed: number, failed: number, errors: string[] }}
 */
function checkTruths(truths, deps) {
  const exec =
    deps && deps.exec
      ? deps.exec
      : (() => {
          const { execSync } = require('node:child_process');
          return cmd => execSync(cmd, { shell: false, stdio: 'pipe' });
        })();

  const errors = [];
  let passed = 0;
  let failed = 0;

  for (const truth of truths) {
    try {
      exec(truth.command);
      passed++;
    } catch (err) {
      failed++;
      errors.push(`FAILED: ${truth.description} — ${err.message}`);
    }
  }

  return { passed, failed, errors };
}

// ------------------------------------------------------------------
// checkArtifacts
// ------------------------------------------------------------------

/**
 * Check that all expected file paths exist.
 *
 * @param {string[]} artifacts - Array of file paths to check
 * @param {{ exists?: Function }} [deps] - Injectable dependencies for testing
 * @returns {{ passed: number, failed: number, missing: string[] }}
 */
function checkArtifacts(artifacts, deps) {
  const exists =
    deps && deps.exists
      ? deps.exists
      : (() => {
          const fs = require('node:fs');
          return p => fs.existsSync(p);
        })();

  const missing = [];
  let passed = 0;
  let failed = 0;

  for (const artifactPath of artifacts) {
    // SE-01: Normalize Windows backslash paths
    const normalized = artifactPath.replace(/\\/g, '/');
    if (exists(normalized)) {
      passed++;
    } else {
      failed++;
      missing.push(normalized);
    }
  }

  return { passed, failed, missing };
}

// ------------------------------------------------------------------
// checkWiring
// ------------------------------------------------------------------

/**
 * Check that expected patterns appear in target files.
 *
 * @param {Array<{description: string, pattern: string, file: string}>} keyLinks
 * @param {{ readFile?: Function }} [deps] - Injectable dependencies for testing
 * @returns {{ passed: number, failed: number, missing: string[] }}
 */
function checkWiring(keyLinks, deps) {
  const readFile =
    deps && deps.readFile
      ? deps.readFile
      : (() => {
          const fs = require('node:fs');
          return filePath => fs.readFileSync(filePath, 'utf8');
        })();

  const missing = [];
  let passed = 0;
  let failed = 0;

  for (const link of keyLinks) {
    try {
      const content = readFile(link.file);
      if (content.includes(link.pattern)) {
        passed++;
      } else {
        failed++;
        missing.push(
          `MISSING: ${link.description} (pattern "${link.pattern}" not found in ${link.file})`
        );
      }
    } catch (err) {
      failed++;
      missing.push(`ERROR: ${link.description} — could not read ${link.file}: ${err.message}`);
    }
  }

  return { passed, failed, missing };
}

// ------------------------------------------------------------------
// detectStubs
// ------------------------------------------------------------------

/**
 * Scan source files for stub/placeholder markers.
 *
 * @param {string[]} filePaths - Array of file paths to scan
 * @param {{ readFile?: Function }} [deps] - Injectable dependencies for testing
 * @returns {Array<{file: string, line: number, type: string, content: string}>}
 */
function detectStubs(filePaths, deps) {
  const readFile =
    deps && deps.readFile
      ? deps.readFile
      : (() => {
          const fs = require('node:fs');
          return filePath => fs.readFileSync(filePath, 'utf8');
        })();

  const findings = [];

  for (const filePath of filePaths) {
    // SE-01: Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Skip .md files
    if (normalizedPath.toLowerCase().endsWith('.md')) continue;

    let content;
    try {
      content = readFile(filePath);
    } catch (_err) {
      // File unreadable — skip silently (don't throw)
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isStub(line, filePath)) continue;

      // Determine which pattern matched
      let matchedType = 'UNKNOWN';
      for (const pattern of STUB_PATTERNS) {
        if (pattern.regex.test(line)) {
          matchedType = pattern.name;
          break;
        }
      }

      findings.push({
        file: normalizedPath,
        line: i + 1, // 1-based
        type: matchedType,
        pattern: matchedType,
        content: line.trim(),
      });
    }
  }

  return findings;
}

// ------------------------------------------------------------------
// parseMustHaves
// ------------------------------------------------------------------

/**
 * Extract must_have checklist items from plan markdown content.
 *
 * Looks for a section header matching /must_haves?/i and extracts
 * markdown checklist items (- [ ] or - [x]) until the next section.
 *
 * @param {string|null|undefined} planContent
 * @returns {Array<{text: string, checked: boolean}>}
 */
function parseMustHaves(planContent) {
  if (!planContent) return [];

  const lines = String(planContent).split('\n');
  const items = [];
  let inSection = false;

  for (const line of lines) {
    // Detect must_haves section header (## must_haves or # must_haves etc.)
    if (/^#{1,6}\s+must_haves?\s*$/i.test(line.trim())) {
      inSection = true;
      continue;
    }

    // Stop on next section header
    if (inSection && /^#{1,6}\s+/.test(line)) {
      break;
    }

    if (!inSection) continue;

    // Match checklist items: - [ ] text or - [x] text
    const checkedMatch = line.match(/^[\s]*-\s+\[x\]\s+(.+)$/i);
    const uncheckedMatch = line.match(/^[\s]*-\s+\[\s*\]\s+(.+)$/);

    if (checkedMatch) {
      items.push({ text: checkedMatch[1].trim(), checked: true });
    } else if (uncheckedMatch) {
      items.push({ text: uncheckedMatch[1].trim(), checked: false });
    }
  }

  return items;
}

module.exports = {
  checkTruths,
  checkArtifacts,
  checkWiring,
  detectStubs,
  parseMustHaves,
};
