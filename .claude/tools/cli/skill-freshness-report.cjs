#!/usr/bin/env node
'use strict';

/**
 * Skill Freshness Report
 *
 * Walks all SKILL.md files, parses frontmatter for verified/lastVerifiedAt,
 * buckets by age, and reports on freshness/staleness.
 *
 * Usage:
 *   node .claude/tools/cli/skill-freshness-report.cjs [--json]
 */

const fs = require('fs');
const path = require('path');

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

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

function collectSkillFiles(projectRoot) {
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  return walk(skillsDir, 'SKILL.md').filter(file => {
    const rel = path.relative(skillsDir, file).replace(/\\/g, '/');
    if (rel.startsWith('_archive/') || rel.includes('/_archive/')) return false;
    return true;
  });
}

function parseFrontmatterValue(content, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function isLikelyIso8601(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(String(value || '').trim());
}

function ageBucket(ageMs) {
  if (ageMs < ONE_MONTH_MS) return '<1mo';
  if (ageMs < THREE_MONTHS_MS) return '1-3mo';
  if (ageMs < SIX_MONTHS_MS) return '3-6mo';
  return '>6mo';
}

function generateFreshnessReport(projectRoot) {
  const skillFiles = collectSkillFiles(projectRoot);
  const now = Date.now();

  const buckets = { '<1mo': 0, '1-3mo': 0, '3-6mo': 0, '>6mo': 0, 'no-date': 0 };
  let verified = 0;
  let unverified = 0;
  const skills = [];

  for (const file of skillFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const name = path.basename(path.dirname(file));
      const isVerified = parseFrontmatterValue(content, 'verified') === 'true';
      const rawLastVerified = parseFrontmatterValue(content, 'lastVerifiedAt');

      if (isVerified) {
        verified++;
      } else {
        unverified++;
      }

      let ageMs = null;
      if (rawLastVerified && isLikelyIso8601(rawLastVerified)) {
        const lastVerified = new Date(rawLastVerified).getTime();
        if (!isNaN(lastVerified)) {
          ageMs = now - lastVerified;
          const bucket = ageBucket(ageMs);
          buckets[bucket]++;
        } else {
          buckets['no-date']++;
        }
      } else if (!rawLastVerified) {
        buckets['no-date']++;
      } else {
        // Non-ISO date string: treat as no-date
        buckets['no-date']++;
      }

      skills.push({
        name,
        verified: isVerified,
        lastVerifiedAt: rawLastVerified || null,
        ageMs,
        path: path.relative(projectRoot, file).replace(/\\/g, '/'),
      });
    } catch (_err) {
      // Skip files we cannot read
    }
  }

  // Stale skills: >6 months old
  const staleSkills = skills
    .filter(s => s.ageMs !== null && s.ageMs > SIX_MONTHS_MS)
    .sort((a, b) => b.ageMs - a.ageMs);

  // Top oldest: sorted by age descending, skills with no date excluded
  const topOldest = skills
    .filter(s => s.ageMs !== null)
    .sort((a, b) => b.ageMs - a.ageMs)
    .slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: skillFiles.length,
      verified,
      unverified,
    },
    buckets,
    staleSkills,
    topOldest,
    skills,
  };
}

function formatDays(ms) {
  if (ms === null) return 'N/A';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function prettyPrint(report) {
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const red = '\x1b[31m';
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';

  console.log(`\n${bold}=== SKILL FRESHNESS REPORT ===${reset}`);
  console.log(`Generated: ${report.timestamp}\n`);

  console.log(`${bold}Summary:${reset}`);
  console.log(`  Total skills:   ${report.summary.total}`);
  console.log(`  ${green}Verified:       ${report.summary.verified}${reset}`);
  console.log(`  ${red}Unverified:     ${report.summary.unverified}${reset}\n`);

  console.log(`${bold}Age Distribution:${reset}`);
  console.log(`  ${green}<1 month:     ${report.buckets['<1mo']}${reset}`);
  console.log(`  ${yellow}1-3 months:   ${report.buckets['1-3mo']}${reset}`);
  console.log(`  ${yellow}3-6 months:   ${report.buckets['3-6mo']}${reset}`);
  console.log(`  ${red}>6 months:    ${report.buckets['>6mo']}${reset}`);
  console.log(`  No date:      ${report.buckets['no-date']}\n`);

  if (report.staleSkills.length > 0) {
    console.log(`${bold}${red}Stale Skills (>6 months):${reset}`);
    for (const skill of report.staleSkills) {
      console.log(`  ${red}- ${skill.name} (${formatDays(skill.ageMs)} old)${reset}`);
    }
    console.log();
  }

  if (report.topOldest.length > 0) {
    console.log(`${bold}Top Oldest Skills:${reset}`);
    for (const skill of report.topOldest.slice(0, 10)) {
      const color =
        skill.ageMs > SIX_MONTHS_MS ? red : skill.ageMs > THREE_MONTHS_MS ? yellow : green;
      console.log(`  ${color}- ${skill.name} (${formatDays(skill.ageMs)} old)${reset}`);
    }
    console.log();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const projectRoot = findProjectRoot();
  const report = generateFreshnessReport(projectRoot);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    prettyPrint(report);
  }
}

module.exports = { generateFreshnessReport };
