#!/usr/bin/env node
'use strict';

/**
 * Check Skill Staleness
 *
 * Scans all skills with manifest.json files, computes staleness based on
 * lastResearchDate + staleAfterDays, and outputs a summary of stale skills.
 *
 * Optionally marks skills as STALE in their manifest files and integrates
 * with validate-skill-ecosystem.cjs output.
 *
 * Usage:
 *   node .claude/tools/cli/check-skill-staleness.cjs [--mark-stale] [--json] [--output-json <file>] [--output-md <file>]
 *
 * Options:
 *   --mark-stale         Mark stale skills with "stale": true in manifest
 *   --json               Output summary as JSON to stdout
 *   --output-json <file> Write detailed JSON report to file
 *   --output-md <file>   Write Markdown report to file
 */

const fs = require('fs');
const path = require('path');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const SKILLS_ROOT_REL = path.join('.claude', 'skills');
const REPORTS_ROOT_REL = path.join('.claude', 'context', 'reports');

function _findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function normalizeRelPath(p) {
  return p.split(path.sep).join('/');
}

function isArchivedSkillPath(skillRelativePath) {
  const parts = skillRelativePath.split('/');
  return parts.some(part => part === '_archive' || part === 'archive' || part === 'dead');
}

function findAllSkills(skillsRoot) {
  const found = [];

  function walk(currentDir, currentRel) {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const hasSkillMd = entries.some(e => e.isFile() && e.name === 'SKILL.md');

    if (hasSkillMd && currentRel) {
      found.push(normalizeRelPath(currentRel));
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      walk(path.join(currentDir, entry.name), path.join(currentRel, entry.name));
    }
  }

  walk(skillsRoot, '');
  return found.sort((a, b) => a.localeCompare(b));
}

function fileExists(p) {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

/**
 * Check if a skill is stale based on manifest.json fields.
 *
 * @param {string} skillDir - Absolute path to skill directory
 * @returns {{ isStale: boolean, reason: string, lastResearchDate: string|null, staleAfterDays: number|null, ageInDays: number|null }}
 */
function checkStaleness(skillDir) {
  const manifestPath = path.join(skillDir, 'manifest.json');

  if (!fileExists(manifestPath)) {
    return {
      isStale: false,
      reason: 'no_manifest',
      lastResearchDate: null,
      staleAfterDays: null,
      ageInDays: null,
    };
  }

  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    manifest = safeParseJSON(content, {});
    if (!manifest || typeof manifest !== 'object') {
      return {
        isStale: false,
        reason: 'invalid_manifest',
        lastResearchDate: null,
        staleAfterDays: null,
        ageInDays: null,
      };
    }
  } catch (_err) {
    return {
      isStale: false,
      reason: 'manifest_parse_error',
      lastResearchDate: null,
      staleAfterDays: null,
      ageInDays: null,
    };
  }

  const { lastResearchDate, staleAfterDays } = manifest;

  // If either field is missing, can't determine staleness
  if (!lastResearchDate || staleAfterDays === undefined || staleAfterDays === null) {
    return {
      isStale: false,
      reason: 'missing_staleness_fields',
      lastResearchDate,
      staleAfterDays,
      ageInDays: null,
    };
  }

  // Parse the date
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(lastResearchDate)) {
    return {
      isStale: false,
      reason: 'invalid_date_format',
      lastResearchDate,
      staleAfterDays,
      ageInDays: null,
    };
  }

  // Calculate age — append 'T00:00:00Z' to force UTC parsing so the result
  // does not shift by +/- 1 day depending on the local timezone offset.
  const lastDate = new Date(
    lastResearchDate.length === 10 ? lastResearchDate + 'T00:00:00Z' : lastResearchDate
  );
  if (isNaN(lastDate.getTime())) {
    return {
      isStale: false,
      reason: 'invalid_date_value',
      lastResearchDate,
      staleAfterDays,
      ageInDays: null,
    };
  }

  const now = new Date();
  const ageInDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
  const isStale = ageInDays > staleAfterDays;

  return {
    isStale,
    reason: isStale ? 'stale' : 'fresh',
    lastResearchDate,
    staleAfterDays,
    ageInDays,
  };
}

/**
 * Mark a skill as stale in its manifest.json
 *
 * @param {string} skillDir - Absolute path to skill directory
 * @returns {{ success: boolean, error?: string }}
 */
function markAsStale(skillDir) {
  const manifestPath = path.join(skillDir, 'manifest.json');

  if (!fileExists(manifestPath)) {
    return { success: false, error: 'manifest not found' };
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = safeParseJSON(content, {});
    if (!manifest || typeof manifest !== 'object') {
      return { success: false, error: 'invalid manifest' };
    }

    // Mark as stale
    manifest.stale = true;
    manifest.markedStaleAt = new Date().toISOString().slice(0, 10);

    // Write back
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Evaluate staleness for all skills
 *
 * @param {string} projectRoot - Project root path
 * @param {boolean} markStale - Whether to mark stale skills
 * @returns {{ results: Array, summary: Object }}
 */
function evaluateAllSkills(projectRoot, markStale = false) {
  const skillsRoot = path.join(projectRoot, SKILLS_ROOT_REL);
  const skillPaths = findAllSkills(skillsRoot);

  const results = [];

  for (const skillRelativePath of skillPaths) {
    // Skip archived skills
    if (isArchivedSkillPath(skillRelativePath)) {
      continue;
    }

    const skillDir = path.join(skillsRoot, ...skillRelativePath.split('/'));
    const staleness = checkStaleness(skillDir);

    const result = {
      skill: skillRelativePath,
      ...staleness,
    };

    // Optionally mark as stale
    if (staleness.isStale && markStale) {
      const markResult = markAsStale(skillDir);
      result.marked = markResult.success;
      if (!markResult.success) {
        result.markError = markResult.error;
      }
    }

    results.push(result);
  }

  // Build summary
  const stale = results.filter(r => r.isStale);
  const fresh = results.filter(r => !r.isStale);
  const noManifest = results.filter(r => r.reason === 'no_manifest');
  const missingFields = results.filter(r => r.reason === 'missing_staleness_fields');
  const errors = results.filter(r => r.reason.includes('error'));

  const marked = results.filter(r => r.marked);

  const summary = {
    timestamp: new Date().toISOString(),
    totalSkills: results.length,
    staleCount: stale.length,
    freshCount: fresh.length,
    noManifestCount: noManifest.length,
    missingFieldsCount: missingFields.length,
    errorCount: errors.length,
    markedCount: marked.length,
    stalePercentage: results.length > 0 ? Math.round((stale.length / results.length) * 100) : 0,
  };

  return { results, summary };
}

function renderMarkdown(summary, results, generatedAt) {
  const stale = results.filter(r => r.isStale).sort((a, b) => b.ageInDays - a.ageInDays);
  const noManifest = results.filter(r => r.reason === 'no_manifest');
  const missingFields = results.filter(r => r.reason === 'missing_staleness_fields');
  const errors = results.filter(r => r.reason.includes('error'));

  const lines = [];
  lines.push('# Skill Staleness Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total skills audited: ${summary.totalSkills}`);
  lines.push(`- Stale skills: ${summary.staleCount} (${summary.stalePercentage}%)`);
  lines.push(`- Fresh skills: ${summary.freshCount}`);
  lines.push(`- Without manifest: ${summary.noManifestCount}`);
  lines.push(`- Missing staleness fields: ${summary.missingFieldsCount}`);
  lines.push(`- Errors: ${summary.errorCount}`);
  lines.push(`- Skills marked stale: ${summary.markedCount}`);
  lines.push('');

  if (stale.length > 0) {
    lines.push('## Stale Skills');
    lines.push('');
    for (const skill of stale) {
      const ago = `${skill.ageInDays} days (stale after ${skill.staleAfterDays})`;
      const lastDate = skill.lastResearchDate || 'unknown';
      lines.push(`- **${skill.skill}**: ${ago} (last: ${lastDate})`);
    }
    lines.push('');
  }

  if (noManifest.length > 0) {
    lines.push('## Skills Without Manifest');
    lines.push('');
    lines.push('These skills lack manifest.json and should be updated:');
    lines.push('');
    for (const skill of noManifest) {
      lines.push(`- ${skill.skill}`);
    }
    lines.push('');
  }

  if (missingFields.length > 0) {
    lines.push('## Skills Missing Staleness Fields');
    lines.push('');
    lines.push('These skills have manifest.json but lack lastResearchDate and/or staleAfterDays:');
    lines.push('');
    for (const skill of missingFields) {
      const missing = [];
      if (!skill.lastResearchDate) missing.push('lastResearchDate');
      if (skill.staleAfterDays === null || skill.staleAfterDays === undefined)
        missing.push('staleAfterDays');
      lines.push(`- ${skill.skill} (missing: ${missing.join(', ')})`);
    }
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const skill of errors) {
      lines.push(`- ${skill.skill}: ${skill.reason}`);
    }
    lines.push('');
  }

  lines.push('## Recommendations');
  lines.push('');
  lines.push(`1. Update ${summary.noManifestCount} skills to add manifest.json files`);
  lines.push(`2. Update ${summary.missingFieldsCount} skills to include staleness tracking fields`);
  if (summary.staleCount > 0) {
    lines.push(
      `3. Review and refresh ${summary.staleCount} stale skills (or update staleAfterDays threshold)`
    );
  }
  lines.push('');
  lines.push('## Integration with validate-skill-ecosystem');
  lines.push('');
  lines.push(
    'This report should be reviewed alongside `validate-skill-ecosystem.cjs` output to ensure:'
  );
  lines.push('');
  lines.push('- Stale skills also have complete ecosystem artifacts (SKILL.md, tools, etc.)');
  lines.push('- Fresh skills meet ecosystem quality standards');
  lines.push('- Stale skills are scheduled for research/refresh cycles');
  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = {
    projectRoot: process.cwd(),
    markStale: false,
    jsonMode: false,
    outputJson: null,
    outputMd: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mark-stale') {
      args.markStale = true;
    } else if (argv[i] === '--json') {
      args.jsonMode = true;
    } else if (argv[i] === '--output-json' && argv[i + 1]) {
      args.outputJson = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--output-md' && argv[i + 1]) {
      args.outputMd = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--project-root' && argv[i + 1]) {
      args.projectRoot = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function runCheck({ projectRoot, markStale, outputJson, outputMd }) {
  const reportRoot = path.join(projectRoot, REPORTS_ROOT_REL);
  const stamp = new Date().toISOString();
  const date = stamp.slice(0, 10);

  const outJson = outputJson || path.join(reportRoot, `skill-staleness-check-${date}.json`);
  const outMd = outputMd || path.join(reportRoot, `skill-staleness-check-${date}.md`);

  const { results, summary } = evaluateAllSkills(projectRoot, markStale);

  const report = {
    generatedAt: stamp,
    projectRoot,
    markStale,
    summary,
    results,
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outMd, renderMarkdown(summary, results, stamp));

  return {
    summary,
    outputJson: outJson,
    outputMd: outMd,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runCheck(args);

  console.log('Skill Staleness Check');
  console.log('====================');
  console.log(`Total skills audited: ${result.summary.totalSkills}`);
  console.log(`Stale skills: ${result.summary.staleCount} (${result.summary.stalePercentage}%)`);
  console.log(`Fresh skills: ${result.summary.freshCount}`);
  console.log(`Without manifest: ${result.summary.noManifestCount}`);
  console.log(`Missing fields: ${result.summary.missingFieldsCount}`);
  console.log(`Errors: ${result.summary.errorCount}`);
  if (result.summary.markedCount > 0) {
    console.log(`Marked stale: ${result.summary.markedCount}`);
  }
  console.log(`\nJSON report: ${result.outputJson}`);
  console.log(`Markdown report: ${result.outputMd}`);
}

const wrappedMain = wrapCLITool(main, 'check-skill-staleness');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  findAllSkills,
  isArchivedSkillPath,
  checkStaleness,
  markAsStale,
  evaluateAllSkills,
  runCheck,
  parseArgs,
};
