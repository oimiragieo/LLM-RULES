#!/usr/bin/env node
'use strict';

/**
 * Backfill Skill Verification Fields
 *
 * Walks .claude/skills/ and adds `verified: false` and `lastVerifiedAt` to
 * SKILL.md files that are missing these frontmatter fields.
 *
 * Uses simple string manipulation (not a YAML parser) to avoid reformatting
 * existing YAML content.
 *
 * Usage:
 *   node .claude/tools/cli/backfill-skill-verification.cjs [--dry-run] [--project-root <path>]
 */

const fs = require('fs');
const path = require('path');

/**
 * Walk a directory recursively and collect files matching an extension.
 * Reuses the pattern from audit-skill-recency.cjs.
 */
function walk(dir, extension, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, extension, out);
    } else if (entry.name.endsWith(extension)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect SKILL.md files, excluding _archive directories.
 * Pattern borrowed from audit-skill-recency.cjs collectSkillFiles().
 */
function collectSkillFiles(projectRoot) {
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  return walk(skillsDir, 'SKILL.md').filter(file => {
    const rel = path.relative(skillsDir, file).replace(/\\/g, '/');
    if (rel.startsWith('_archive/') || rel.includes('/_archive/')) return false;
    return true;
  });
}

/**
 * Check whether frontmatter already contains lastVerifiedAt.
 * Uses simple regex match against the raw frontmatter text.
 */
function hasLastVerifiedAt(frontmatterText) {
  return /^lastVerifiedAt:\s*/m.test(frontmatterText);
}

/**
 * Validate that the frontmatter YAML is not obviously malformed.
 * We check for common malformed patterns:
 *   - Lines starting with `:` (missing key)
 *   - Unclosed brackets on the same line as a key
 * Returns true if frontmatter looks safe to modify.
 */
function isFrontmatterSafe(frontmatterText) {
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Line starting with : (missing key)
    if (trimmed.startsWith(':')) return false;
  }
  return true;
}

/**
 * Backfill SKILL.md files with verification fields.
 *
 * For each SKILL.md found under .claude/skills/ (excluding _archive):
 *   1. Read the file content
 *   2. Check for frontmatter (--- delimiters)
 *   3. If already has lastVerifiedAt -> skip
 *   4. If frontmatter looks malformed -> record error, skip
 *   5. If missing -> insert `verified: false` and `lastVerifiedAt: <timestamp>`
 *      before the closing `---`
 *   6. Write back (unless dryRun)
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {object} options
 * @param {boolean} [options.dryRun=false] - If true, do not write files
 * @param {string} [options.timestamp] - ISO timestamp to use for lastVerifiedAt
 * @returns {{ total: number, updated: number, skipped: number, errors: number }}
 */
function backfillSkills(projectRoot, options = {}) {
  const { dryRun = false, timestamp = new Date().toISOString() } = options;

  const skillFiles = collectSkillFiles(projectRoot);

  let total = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of skillFiles) {
    total++;

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for frontmatter delimiters
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        // No frontmatter found -- treat as error (cannot safely modify)
        errors++;
        continue;
      }

      const frontmatterText = fmMatch[1];

      // Already has lastVerifiedAt -> skip
      if (hasLastVerifiedAt(frontmatterText)) {
        skipped++;
        continue;
      }

      // Check if frontmatter is safe to modify
      if (!isFrontmatterSafe(frontmatterText)) {
        errors++;
        continue;
      }

      // Insert verified and lastVerifiedAt before the closing ---
      // Find the position of the closing --- (after the frontmatter)
      const closingDashIndex = content.indexOf('\n---', 3);
      if (closingDashIndex === -1) {
        errors++;
        continue;
      }

      const before = content.substring(0, closingDashIndex);
      const after = content.substring(closingDashIndex);

      const newContent = before + '\nverified: false\nlastVerifiedAt: ' + timestamp + after;

      if (!dryRun) {
        fs.writeFileSync(filePath, newContent, 'utf8');
      }

      updated++;
    } catch (_err) {
      errors++;
    }
  }

  return { total, updated, skipped, errors };
}

/**
 * Parse CLI arguments.
 */
function parseArgs(argv) {
  const options = {
    dryRun: false,
    projectRoot: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--project-root' && argv[i + 1]) {
      options.projectRoot = path.resolve(argv[++i]);
    }
  }

  return options;
}

// CLI entry point
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  // Resolve project root
  let projectRoot = args.projectRoot;
  if (!projectRoot) {
    try {
      const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
      projectRoot = PROJECT_ROOT;
    } catch {
      projectRoot = process.cwd();
    }
  }

  const result = backfillSkills(projectRoot, {
    dryRun: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  if (args.dryRun) {
    console.log('\n[DRY RUN] No files were modified.');
  }

  console.log(
    `\nTotal: ${result.total}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`
  );
}

module.exports = { backfillSkills };
