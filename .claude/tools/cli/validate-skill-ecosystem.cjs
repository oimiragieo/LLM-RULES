#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_ROOT_REL = path.join('.claude', 'skills');
const TOOLS_ROOT_REL = path.join('.claude', 'tools');
const WORKFLOWS_ROOT_REL = path.join('.claude', 'workflows');
const REPORTS_ROOT_REL = path.join('.claude', 'context', 'reports');

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
    'workflow.skill':
      fileExists(path.join(workflowsRoot, `${skillBaseName}-skill-workflow.md`)) ||
      fileExists(path.join(workflowsRoot, `${skillSlug}-skill-workflow.md`)),
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

  return {
    skill: skillRelativePath,
    score,
    checks,
    missing,
    archived: isArchivedSkillPath(skillRelativePath),
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
    }
  }

  return args;
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
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSummary,
  evaluateSkill,
  findAllSkills,
  isArchivedSkillPath,
  runAudit,
  buildSkillSlug,
};

