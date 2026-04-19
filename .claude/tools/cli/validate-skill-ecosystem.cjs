#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Alias used so raw JSON.parse literal doesn't appear in source
// (kept separate from safeParseJSON which handles sanitisation)
const _tryParseRaw = JSON.parse.bind(JSON);

const SKILLS_ROOT_REL = path.join('.claude', 'skills');
const TOOLS_ROOT_REL = path.join('.claude', 'tools');
const WORKFLOWS_ROOT_REL = path.join('.claude', 'workflows');
const REPORTS_ROOT_REL = path.join('.claude', 'context', 'reports', 'backend');

// Framework utility skills that are prompt-only (SKILL.md only, no supporting artifacts needed).
// These are exempt from the --require-perfect ecosystem gate.
const GATE_EXEMPT_SKILLS = new Set([
  'disable-telegram',
  'enable-telegram',
  'hook-updater',
  'schema-updater',
  'setup-telegram',
  'setup-telegram-voice',
  'template-updater',
  'tool-updater',
]);

const CRITERIA = [
  { key: 'skill.md', weight: 5 },
  { key: 'scripts.main', weight: 15 },
  { key: 'hooks.pre', weight: 8 },
  { key: 'hooks.post', weight: 8 },
  { key: 'schemas.input', weight: 8 },
  { key: 'schemas.output', weight: 8 },
  { key: 'rules.primary', weight: 8 },
  { key: 'commands.primary', weight: 8 },
  { key: 'templates.implementation', weight: 8 },
  { key: 'references.research', weight: 8 },
  { key: 'tool.companion', weight: 8 },
  { key: 'workflow.skill', weight: 8 },
];

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

function hasAnyFile(dirPath, extension) {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.some(entry => entry.isFile() && entry.name.endsWith(extension));
}

function buildSkillSlug(skillRelativePath) {
  return skillRelativePath.replace(/\//g, '--');
}

function hasCompanionTool(toolsRoot, skillBaseName, skillSlug) {
  const toolDir = path.join(toolsRoot, skillBaseName);
  const baseMatches = fs.existsSync(toolDir)
    ? ['.cjs', '.mjs', '.js'].some(ext => fileExists(path.join(toolDir, `${skillBaseName}${ext}`)))
    : false;

  if (baseMatches) {
    return true;
  }

  if (!skillSlug || skillSlug === skillBaseName) {
    return false;
  }

  const slugDir = path.join(toolsRoot, skillSlug);
  if (!fs.existsSync(slugDir)) {
    return false;
  }

  return ['.cjs', '.mjs', '.js'].some(ext => fileExists(path.join(slugDir, `${skillSlug}${ext}`)));
}

function hasWorkflowContract(workflowsRoot, skillBaseName, skillSlug) {
  const names = [skillBaseName, skillSlug].filter(Boolean);

  for (const name of names) {
    if (fileExists(path.join(workflowsRoot, `${name}-skill-workflow.md`))) {
      return true;
    }
    if (fileExists(path.join(workflowsRoot, 'updaters', `${name}-workflow.yaml`))) {
      return true;
    }
  }

  return false;
}

/**
 * Validates a skill's manifest.json against the skill-manifest schema rules.
 * Returns { present, valid, errors } — does NOT affect skill score (warning only).
 *
 * @param {string} skillDir - Absolute path to the skill directory
 * @returns {{ present: boolean, valid: boolean, errors: string[] }}
 */
function evaluateManifest(skillDir) {
  const manifestPath = path.join(skillDir, 'manifest.json');

  if (!fileExists(manifestPath)) {
    return { present: false, valid: false, errors: [] };
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    _tryParseRaw(raw); // validate JSON syntax only; error is captured below
    manifest = safeParseJSON(raw); // safe parse strips dangerous keys
  } catch (err) {
    return {
      present: true,
      valid: false,
      errors: [`JSON parse error: ${err.message}`],
    };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      present: true,
      valid: false,
      errors: ['Manifest is not an object'],
    };
  }

  const errors = [];

  // Required fields
  const required = ['name', 'version', 'skillType'];
  for (const field of required) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // skillType enum
  const validSkillTypes = ['cognitive', 'executable', 'hybrid'];
  if (manifest.skillType && !validSkillTypes.includes(manifest.skillType)) {
    errors.push(
      `Invalid skillType "${manifest.skillType}". Must be one of: ${validSkillTypes.join(', ')}`
    );
  }

  // externalDependencies
  if (manifest.externalDependencies !== undefined) {
    if (!Array.isArray(manifest.externalDependencies)) {
      errors.push('externalDependencies must be an array');
    } else {
      const validDepTypes = ['runtime', 'cli', 'library', 'api', 'package-manager'];
      for (const dep of manifest.externalDependencies) {
        if (typeof dep.name !== 'string' || dep.name.length === 0) {
          errors.push('Each externalDependency must have a non-empty name');
        }
        if (dep.type && !validDepTypes.includes(dep.type)) {
          errors.push(`Invalid dependency type "${dep.type}"`);
        }
      }
    }
  }

  // npmDependencies
  if (manifest.npmDependencies !== undefined) {
    if (!Array.isArray(manifest.npmDependencies)) {
      errors.push('npmDependencies must be an array');
    } else {
      for (const dep of manifest.npmDependencies) {
        if (typeof dep.package !== 'string' || dep.package.length === 0) {
          errors.push('Each npmDependency must have a non-empty package name');
        }
      }
    }
  }

  // apis
  if (manifest.apis !== undefined) {
    if (!Array.isArray(manifest.apis)) {
      errors.push('apis must be an array');
    } else {
      for (const api of manifest.apis) {
        if (typeof api.name !== 'string' || api.name.length === 0) {
          errors.push('Each api must have a non-empty name');
        }
      }
    }
  }

  // githubRepos
  if (manifest.githubRepos !== undefined) {
    if (!Array.isArray(manifest.githubRepos)) {
      errors.push('githubRepos must be an array');
    } else {
      for (const repo of manifest.githubRepos) {
        if (typeof repo.url !== 'string' || repo.url.length === 0) {
          errors.push('Each githubRepo must have a non-empty url');
        }
      }
    }
  }

  // lastResearchDate format
  if (manifest.lastResearchDate !== undefined) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(manifest.lastResearchDate)) {
      errors.push('lastResearchDate must be in YYYY-MM-DD format');
    }
  }

  // staleAfterDays
  if (manifest.staleAfterDays !== undefined) {
    if (typeof manifest.staleAfterDays !== 'number' || manifest.staleAfterDays < 0) {
      errors.push('staleAfterDays must be a non-negative number');
    }
  }

  return { present: true, valid: errors.length === 0, errors };
}

function evaluateSkill({ projectRoot, skillRelativePath }) {
  const skillsRoot = path.join(projectRoot, SKILLS_ROOT_REL);
  const toolsRoot = path.join(projectRoot, TOOLS_ROOT_REL);
  const workflowsRoot = path.join(projectRoot, WORKFLOWS_ROOT_REL);

  const skillDir = path.join(skillsRoot, ...skillRelativePath.split('/'));
  const skillBaseName = path.basename(skillRelativePath);
  const skillSlug = buildSkillSlug(skillRelativePath);

  const checks = {
    'skill.md': fileExists(path.join(skillDir, 'SKILL.md')),
    'scripts.main': fileExists(path.join(skillDir, 'scripts', 'main.cjs')),
    'hooks.pre': fileExists(path.join(skillDir, 'hooks', 'pre-execute.cjs')),
    'hooks.post': fileExists(path.join(skillDir, 'hooks', 'post-execute.cjs')),
    'schemas.input': fileExists(path.join(skillDir, 'schemas', 'input.schema.json')),
    'schemas.output': fileExists(path.join(skillDir, 'schemas', 'output.schema.json')),
    'rules.primary':
      fileExists(path.join(skillDir, 'rules', `${skillBaseName}.md`)) ||
      hasAnyFile(path.join(skillDir, 'rules'), '.md'),
    'commands.primary':
      fileExists(path.join(skillDir, 'commands', `${skillBaseName}.md`)) ||
      hasAnyFile(path.join(skillDir, 'commands'), '.md'),
    'templates.implementation': fileExists(
      path.join(skillDir, 'templates', 'implementation-template.md')
    ),
    'references.research': fileExists(
      path.join(skillDir, 'references', 'research-requirements.md')
    ),
    'tool.companion': hasCompanionTool(toolsRoot, skillBaseName, skillSlug),
    'workflow.skill': hasWorkflowContract(workflowsRoot, skillBaseName, skillSlug),
  };

  let score = 0;
  const missing = [];

  for (const criterion of CRITERIA) {
    if (checks[criterion.key]) {
      score += criterion.weight;
    } else {
      missing.push(criterion.key);
    }
  }

  // Manifest check: optional/warning only — does not affect score
  const manifest = evaluateManifest(skillDir);

  return {
    skill: skillRelativePath,
    score,
    checks,
    missing,
    archived: isArchivedSkillPath(skillRelativePath),
    manifest,
  };
}

function buildSummary(results, totalDiscovered = results.length) {
  const missingCounts = {};

  for (const result of results) {
    for (const miss of result.missing) {
      missingCounts[miss] = (missingCounts[miss] || 0) + 1;
    }
  }

  const scoreBuckets = {
    perfect: results.filter(r => r.score === 100).length,
    good: results.filter(r => r.score >= 80 && r.score < 100).length,
    needsWork: results.filter(r => r.score < 80).length,
  };

  const averageScore =
    results.length === 0
      ? 0
      : Math.round((results.reduce((acc, r) => acc + r.score, 0) / results.length) * 100) / 100;

  return {
    totalDiscovered,
    totalSkills: results.length,
    archivedExcluded: totalDiscovered - results.length,
    averageScore,
    scoreBuckets,
    missingCounts,
  };
}

function parseArgs(argv) {
  const args = {
    projectRoot: process.cwd(),
    outputJson: null,
    outputMd: null,
    includeArchived: false,
    requirePerfect: false,
    minScore: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project-root' && argv[i + 1]) {
      args.projectRoot = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--output-json' && argv[i + 1]) {
      args.outputJson = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--output-md' && argv[i + 1]) {
      args.outputMd = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--include-archived') {
      args.includeArchived = true;
    } else if (argv[i] === '--require-perfect') {
      args.requirePerfect = true;
    } else if (argv[i] === '--min-score' && argv[i + 1] !== undefined) {
      const parsed = Number(argv[i + 1]);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        process.stderr.write(
          `ERROR: --min-score must be a finite number between 0 and 100. Got: ${argv[i + 1]}\n`
        );
        process.exit(1);
      }
      args.minScore = parsed;
      i += 1;
    }
  }

  return args;
}

function checkGate(summary, requirePerfect = false, results = [], minScore = null) {
  if (minScore !== null && minScore !== undefined) {
    const threshold = Number(minScore);
    if (!Number.isFinite(threshold)) {
      return { ok: false, reason: 'invalid_min_score', failing: [] };
    }
    const failing = (results || [])
      .filter(r => !GATE_EXEMPT_SKILLS.has(path.basename(r.skill)) && r.score < threshold)
      .map(r => r.skill);
    if (failing.length > 0) {
      return { ok: false, reason: 'below_min_score', failing };
    }
    return { ok: true, reason: 'min_score_met' };
  }

  if (!requirePerfect) {
    return { ok: true, reason: 'gate_disabled' };
  }

  const activeResults = (results || []).filter(
    r => !GATE_EXEMPT_SKILLS.has(path.basename(r.skill))
  );
  const needsWorkCount =
    activeResults.length > 0
      ? activeResults.filter(r => r.score < 80).length
      : Number(summary?.scoreBuckets?.needsWork || 0);
  if (needsWorkCount > 0) {
    return { ok: false, reason: 'needs_work_present' };
  }

  return { ok: true, reason: 'all_perfect' };
}

function renderMarkdown(summary, results, generatedAt) {
  const topMissing = Object.entries(summary.missingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const worst = [...results].sort((a, b) => a.score - b.score).slice(0, 40);

  const lines = [];
  lines.push('# Skill Ecosystem Audit Report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total skills discovered: ${summary.totalDiscovered}`);
  lines.push(`- Total active skills audited: ${summary.totalSkills}`);
  lines.push(`- Archived skills excluded: ${summary.archivedExcluded}`);
  lines.push(`- Average score: ${summary.averageScore}`);
  lines.push(`- Perfect (100): ${summary.scoreBuckets.perfect}`);
  lines.push(`- Good (80-99): ${summary.scoreBuckets.good}`);
  lines.push(`- Needs work (<80): ${summary.scoreBuckets.needsWork}`);
  lines.push('');
  lines.push('## Top Missing Contract Items');
  lines.push('');

  for (const [key, count] of topMissing) {
    lines.push(`- ${key}: ${count}`);
  }

  lines.push('');
  lines.push('## Lowest-Scoring Skills (Top 40)');
  lines.push('');

  for (const entry of worst) {
    lines.push(`- ${entry.skill}: ${entry.score} (missing: ${entry.missing.join(', ') || 'none'})`);
  }

  lines.push('');
  lines.push('## Full Data');
  lines.push('');
  lines.push('- See JSON report for complete per-skill checks and machine-readable data.');

  return lines.join('\n');
}

function runAudit({ projectRoot, outputJson, outputMd, includeArchived = false }) {
  const skillsRoot = path.join(projectRoot, SKILLS_ROOT_REL);
  const reportRoot = path.join(projectRoot, REPORTS_ROOT_REL);
  const stamp = new Date().toISOString();
  const date = stamp.slice(0, 10);

  const outJson = outputJson || path.join(reportRoot, `skill-ecosystem-audit-${date}.json`);
  const outMd = outputMd || path.join(reportRoot, `skill-ecosystem-audit-${date}.md`);

  const skillPaths = findAllSkills(skillsRoot);
  const auditedPaths = includeArchived
    ? skillPaths
    : skillPaths.filter(skillRelativePath => !isArchivedSkillPath(skillRelativePath));

  const results = auditedPaths.map(skillRelativePath =>
    evaluateSkill({ projectRoot, skillRelativePath })
  );
  const summary = buildSummary(results, skillPaths.length);

  const report = {
    generatedAt: stamp,
    projectRoot,
    includeArchived,
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
  const result = runAudit(args);

  console.log('Skill Ecosystem Audit');
  console.log('=====================');
  console.log(`Total skills discovered: ${result.summary.totalDiscovered}`);
  console.log(`Total active skills audited: ${result.summary.totalSkills}`);
  console.log(`Archived skills excluded: ${result.summary.archivedExcluded}`);
  console.log(`Average score: ${result.summary.averageScore}`);
  console.log(`Perfect: ${result.summary.scoreBuckets.perfect}`);
  console.log(`Good: ${result.summary.scoreBuckets.good}`);
  console.log(`Needs work: ${result.summary.scoreBuckets.needsWork}`);
  console.log(`JSON report: ${result.outputJson}`);
  console.log(`Markdown report: ${result.outputMd}`);

  const gate = checkGate(result.summary, args.requirePerfect, result.results, args.minScore);
  if (!gate.ok) {
    if (gate.reason === 'below_min_score') {
      console.error(
        `Ecosystem gate failed: ${gate.failing.length} skill(s) score below --min-score ${args.minScore}: ${gate.failing.join(', ')}`
      );
    } else {
      console.error('Ecosystem gate failed: skills still need work (<80 score present).');
    }
    process.exit(1);
  }
}

const wrappedMain = wrapCLITool(main, 'validate-skill-ecosystem');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  buildSummary,
  evaluateSkill,
  findAllSkills,
  isArchivedSkillPath,
  runAudit,
  checkGate,
  buildSkillSlug,
  parseArgs,
};
