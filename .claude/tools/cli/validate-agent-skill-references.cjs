#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');
const AGENTS_ROOT = path.join(PROJECT_ROOT, '.claude', 'agents');

function walkAgentFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(PROJECT_ROOT, full).replace(/\\/g, '/');
    if (rel.includes('/_archive/')) continue;
    if (entry.isDirectory()) {
      walkAgentFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
      out.push(full);
    }
  }
  return out;
}

function canonicalSkillLookupKey(name) {
  if (typeof name !== 'string' || name.length === 0) return name;
  if (name.startsWith('creators/')) {
    const parts = name.split('/');
    return parts[parts.length - 1] || name;
  }
  return name;
}

function getSkillVariants(name) {
  const variants = new Set();
  if (typeof name !== 'string' || name.length === 0) return [];
  variants.add(name);
  const canonical = canonicalSkillLookupKey(name);
  variants.add(canonical);

  if (canonical === name) {
    variants.add(`creators/${name}`);
  }

  if (name.startsWith('scientific-skills/') && !name.startsWith('scientific-skills/skills/')) {
    const suffix = name.slice('scientific-skills/'.length);
    variants.add(`scientific-skills/skills/${suffix}`);
  }
  if (name.startsWith('scientific-skills/skills/')) {
    const suffix = name.slice('scientific-skills/skills/'.length);
    variants.add(`scientific-skills/${suffix}`);
  }

  return [...variants];
}

function loadSkillIndexSkills(skillIndexPath = SKILL_INDEX_PATH) {
  if (!fs.existsSync(skillIndexPath)) {
    throw new Error(`Missing skill index: ${skillIndexPath}`);
  }
  const raw = safeParseJSON(fs.readFileSync(skillIndexPath, 'utf8'));
  const skills = raw.skills || {};
  const valid = new Set();
  for (const key of Object.keys(skills)) {
    valid.add(key);
    for (const variant of getSkillVariants(key)) {
      valid.add(variant);
    }
    const aliasOf = skills[key] && skills[key].aliasOf;
    if (typeof aliasOf === 'string' && aliasOf.length > 0) {
      valid.add(aliasOf);
      for (const variant of getSkillVariants(aliasOf)) {
        valid.add(variant);
      }
    }
  }
  return valid;
}

function parseFrontmatterSkills(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  try {
    const data = yaml.load(match[1]);
    if (!data || typeof data !== 'object') return [];
    if (!Array.isArray(data.skills)) return [];
    return data.skills.filter(s => typeof s === 'string' && s.length > 0);
  } catch (_err) {
    return [];
  }
}

function extractInvokedSkills(content) {
  const refs = [];
  const pattern = /Skill\(\{\s*skill:\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1]) refs.push(match[1]);
  }
  return refs;
}

function collectAgentSkillReferences(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const refs = [];
  const pushRef = (source, skill) => {
    if (typeof skill !== 'string') return;
    const normalized = skill.trim();
    if (!normalized) return;
    // Ignore documentation placeholders used in guidance examples.
    if (/[<>]/.test(normalized)) return;
    if (normalized.toLowerCase() === 'name') return;
    refs.push({ source, skill: normalized });
  };

  for (const skill of parseFrontmatterSkills(content)) {
    pushRef('frontmatter', skill);
  }
  for (const skill of extractInvokedSkills(content)) {
    pushRef('invocation', skill);
  }
  return refs;
}

function validateAgentSkillReferences({
  agentsRoot = AGENTS_ROOT,
  skillIndexPath = SKILL_INDEX_PATH,
} = {}) {
  const validSkills = loadSkillIndexSkills(skillIndexPath);
  const files = walkAgentFiles(agentsRoot);
  const issues = [];
  let totalReferences = 0;

  for (const filePath of files) {
    const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
    const refs = collectAgentSkillReferences(filePath);
    for (const ref of refs) {
      totalReferences += 1;
      const variants = getSkillVariants(ref.skill);
      const found = variants.some(v => validSkills.has(v));
      if (!found) {
        issues.push(`${rel} (${ref.source}) references unknown skill "${ref.skill}"`);
      }
    }
  }

  return {
    pass: issues.length === 0,
    issues,
    scannedFiles: files.length,
    totalReferences,
  };
}

function parseArgs(argv) {
  const args = { agentsRoot: AGENTS_ROOT, skillIndexPath: SKILL_INDEX_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--agents-root' && argv[i + 1]) {
      args.agentsRoot = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--skill-index' && argv[i + 1]) {
      args.skillIndexPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = validateAgentSkillReferences(args);

  if (result.pass) {
    console.log(
      `Agent skill reference validation passed (${result.scannedFiles} agent files, ${result.totalReferences} references).`
    );
    process.exit(0);
  }

  console.error('Agent skill reference validation failed:');
  for (const issue of result.issues.slice(0, 50)) {
    console.error(`- ${issue}`);
  }
  if (result.issues.length > 50) {
    console.error(`- ... ${result.issues.length - 50} more issue(s)`);
  }
  process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'validate-agent-skill-references');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  walkAgentFiles,
  canonicalSkillLookupKey,
  getSkillVariants,
  loadSkillIndexSkills,
  parseFrontmatterSkills,
  extractInvokedSkills,
  collectAgentSkillReferences,
  validateAgentSkillReferences,
};
