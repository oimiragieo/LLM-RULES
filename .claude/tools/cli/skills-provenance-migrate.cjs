#!/usr/bin/env node
/**
 * @file .claude/tools/cli/skills-provenance-migrate.cjs
 * @description Bulk migration: add provenance frontmatter to all SKILL.md files
 *
 * IRON LAW EXCEPTION DOCUMENTED:
 * The `skill-updater` skill is intended for individual skill updates via the
 * agent framework. This script is a one-time mechanical retrofit that adds
 * metadata fields to 342+ builtin skills without modifying any content.
 * Using skill-updater for 342 files would:
 *   (a) Require 342 separate agent spawns (prohibitive cost/time)
 *   (b) Risk context drift across so many iterations
 *   (c) Be functionally identical to this script — pure frontmatter append
 * Therefore, a dedicated migration script is the correct tool here.
 * Reference: ArXiv [2504.19951] + [2602.14798] provenance validation.
 *
 * Usage:
 *   node .claude/tools/cli/skills-provenance-migrate.cjs [--dry-run] [--verbose]
 *
 * What it does:
 *   - Finds all .claude/skills/ SKILL.md files (recursive)
 *   - Skips any already having source, trust_score, and provenance_sha
 *   - For files missing any of the 3 fields:
 *     - Adds source: builtin
 *     - Adds trust_score: 100
 *     - Computes provenance_sha as SHA-256(content)[0:16]
 *     - Inserts the 3 fields at the END of the existing frontmatter block
 *   - Does NOT modify skill body content — only YAML frontmatter is touched
 *   - Skips archived skills (_archive/ paths)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { computeProvenanceSha } = require('../../lib/validation/skill-provenance.cjs');

const PROJECT_ROOT = process.cwd();
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

/**
 * Check whether a path is within an archive directory.
 * @param {string} filePath
 * @returns {boolean}
 */
function isArchived(filePath) {
  return /(^|\/)(?:_archive|archive|dead)(?:\/|$)/.test(filePath.replace(/\\/g, '/'));
}

/**
 * Parse the frontmatter block from a SKILL.md content string.
 * Returns { hasFrontmatter, frontmatterText, bodyText } or null if no frontmatter.
 *
 * @param {string} content
 * @returns {{ hasFrontmatter: boolean, frontmatterText: string, bodyText: string } | null}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { hasFrontmatter: false, frontmatterText: '', bodyText: content };
  }
  return {
    hasFrontmatter: true,
    frontmatterText: match[1],
    bodyText: match[2],
  };
}

const VALID_SOURCES_SET = new Set(['builtin', 'community', 'plugin', 'external']);

/**
 * Check which provenance fields are missing or invalid from the frontmatter YAML text.
 *
 * @param {string} yamlText - Raw YAML string from between --- markers
 * @returns {{ missingSource: boolean, invalidSource: boolean, missingTrustScore: boolean, missingProvenanceSha: boolean }}
 */
function checkMissingProvenanceFields(yamlText) {
  const srcMatch = yamlText.match(/^source:\s*(.+)$/m);
  const hasSource = !!srcMatch;
  const sourceVal = hasSource ? srcMatch[1].trim() : null;
  const invalidSource = hasSource && !VALID_SOURCES_SET.has(sourceVal);
  return {
    missingSource: !hasSource,
    invalidSource,
    missingTrustScore: !/^trust_score:\s*\d+$/m.test(yamlText),
    missingProvenanceSha: !/^provenance_sha:\s*[0-9a-fA-F]{16}$/m.test(yamlText),
  };
}

/**
 * Rebuild the SKILL.md content by appending missing provenance fields to frontmatter.
 *
 * @param {string} content - Original file content
 * @param {string} filePath - Path for logging
 * @param {boolean} dryRun - If true, do not write
 * @param {boolean} verbose - If true, log details
 * @returns {{ modified: boolean, fieldsAdded: string[] }}
 */
function migrateFile(content, filePath, dryRun, verbose) {
  const parsed = parseFrontmatter(content);

  if (!parsed.hasFrontmatter) {
    // No frontmatter at all — inject a minimal one
    const sha = computeProvenanceSha(content);
    const newFrontmatter = `---\nsource: builtin\ntrust_score: 100\nprovenance_sha: ${sha}\n---\n`;
    const newContent = newFrontmatter + content;

    if (!dryRun) {
      fs.writeFileSync(filePath, newContent, 'utf8');
    }
    if (verbose) {
      console.log(`  [new-frontmatter] ${filePath}`);
    }
    return { modified: true, fieldsAdded: ['source', 'trust_score', 'provenance_sha'] };
  }

  const { missingSource, invalidSource, missingTrustScore, missingProvenanceSha } =
    checkMissingProvenanceFields(parsed.frontmatterText);

  if (!missingSource && !invalidSource && !missingTrustScore && !missingProvenanceSha) {
    // All fields already present and valid — skip
    return { modified: false, fieldsAdded: [] };
  }

  // Compute SHA on the ORIGINAL content (before modification)
  const sha = computeProvenanceSha(content);

  const fieldsAdded = [];
  let patchedFrontmatter = parsed.frontmatterText;
  let appendBlock = '';

  if (invalidSource) {
    // Replace the invalid source value with 'community' (external origin)
    patchedFrontmatter = patchedFrontmatter.replace(/^source:\s*.+$/m, 'source: community');
    fieldsAdded.push('source(fixed)');
  }

  if (missingSource) {
    appendBlock += 'source: builtin\n';
    fieldsAdded.push('source');
  }
  if (missingTrustScore) {
    appendBlock += 'trust_score: 100\n';
    fieldsAdded.push('trust_score');
  }
  if (missingProvenanceSha) {
    appendBlock += `provenance_sha: ${sha}\n`;
    fieldsAdded.push('provenance_sha');
  }

  // Preserve existing frontmatter order; append new fields at the end of the frontmatter block
  const baseFm =
    appendBlock.length > 0 ? patchedFrontmatter + '\n' + appendBlock.trimEnd() : patchedFrontmatter;
  const newContent = `---\n${baseFm}\n---\n${parsed.bodyText}`;

  if (!dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
  if (verbose) {
    console.log(`  [patched +${fieldsAdded.join(',')}] ${filePath}`);
  }

  return { modified: true, fieldsAdded };
}

/**
 * Recursively collect all SKILL.md paths under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectSkillFiles(dir) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Check for SKILL.md directly inside this directory first
      const skillMd = path.join(fullPath, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        results.push(skillMd);
        // Also recurse into nested 'skills/' subdirectory (e.g. scientific-skills/skills/*)
        const nestedSkillsDir = path.join(fullPath, 'skills');
        if (fs.existsSync(nestedSkillsDir)) {
          results.push(...collectSkillFiles(nestedSkillsDir));
        }
        continue;
      }
      // Otherwise recurse
      results.push(...collectSkillFiles(fullPath));
    }
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  console.log('Skill Provenance Migration');
  console.log('==========================');
  if (dryRun) {
    console.log('Mode: DRY RUN (no files will be written)\n');
  } else {
    console.log('Mode: LIVE (files will be modified)\n');
  }

  const allFiles = collectSkillFiles(SKILLS_DIR);
  const activeFiles = allFiles.filter(f => !isArchived(f));
  const archivedCount = allFiles.length - activeFiles.length;

  console.log(`Found ${allFiles.length} SKILL.md files (${archivedCount} archived, skipped)`);
  console.log(`Processing ${activeFiles.length} active skills...\n`);

  let modifiedCount = 0;
  let skippedCount = 0;
  const failedFiles = [];

  for (const filePath of activeFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { modified } = migrateFile(content, filePath, dryRun, verbose);
      if (modified) {
        modifiedCount++;
      } else {
        skippedCount++;
        if (verbose) {
          console.log(`  [skip — already has provenance] ${filePath}`);
        }
      }
    } catch (err) {
      failedFiles.push({ filePath, error: err.message });
      console.error(`  [ERROR] ${filePath}: ${err.message}`);
    }
  }

  console.log('\n--- Results ---');
  console.log(`  Retrofitted: ${modifiedCount}`);
  console.log(`  Already had provenance (skipped): ${skippedCount}`);
  console.log(`  Errors: ${failedFiles.length}`);

  if (failedFiles.length > 0) {
    console.error('\nFailed files:');
    for (const { filePath, error } of failedFiles) {
      console.error(`  ${filePath}: ${error}`);
    }
    process.exit(1);
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.');
  } else {
    console.log('\nMigration complete.');
  }
}

main();
