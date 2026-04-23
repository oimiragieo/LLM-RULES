#!/usr/bin/env node
/**
 * Skill Index Generator
 * ======================
 *
 * Generates .claude/config/skill-index.json from skill-catalog.md and SKILL.md files
 *
 * Usage:
 *   node .claude/tools/cli/generate-skill-index.cjs [options]
 *
 * Options:
 *   --dry-run   Show what would be generated without writing
 *   --validate  Only validate existing index
 *   --verbose   Show detailed output
 *   --quick     Fast mode - skip SKILL.md scan and use catalog/mappings only
 *   --scan      Explicitly enable SKILL.md scan (default behavior)
 *
 * Output:
 *   .claude/config/skill-index.json
 */

/* eslint-disable max-lines -- single CLI script; splitting would obscure flow */
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { auditAgentSkillRefs } = require('../../lib/token-reference/resolver.cjs');

const fs = require('fs');
const path = require('path');

// Project root detection
const PROJECT_ROOT = process.cwd();
const CONFIG_DIR = path.join(PROJECT_ROOT, '.claude', 'config');
const INDEX_PATH = path.join(CONFIG_DIR, 'skill-index.json');
const CATALOG_PATH = path.join(PROJECT_ROOT, '.claude', 'docs', 'skill-catalog.md');
const CATALOG_PATH_LEGACY = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'skill-catalog.md'
);
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const AGENT_SKILL_MATRIX_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'config',
  'agent-skill-matrix.json'
);

// Domain mappings
const {
  DOMAIN_MAP,
  CATEGORY_MAP,
  AGENT_SKILLS,
  SKILL_TOOLS,
  SKILL_DESCRIPTION_MAP,
} = require('./generate-skill-index-definitions.cjs');
const { validateIndex } = require('./generate-skill-index-validators.cjs');

function loadAgentSkillMatrix() {
  const skillToAgents = {};
  const agentToSkills = {};

  try {
    if (!fs.existsSync(AGENT_SKILL_MATRIX_PATH)) {
      return { skillToAgents, agentToSkills };
    }
    const raw = fs.readFileSync(AGENT_SKILL_MATRIX_PATH, 'utf8');
    const matrix = safeParseJSON(raw);
    const agents = matrix.agents || {};

    for (const [_category, categoryAgents] of Object.entries(agents)) {
      if (typeof categoryAgents !== 'object') continue;
      for (const [agentId, config] of Object.entries(categoryAgents)) {
        if (typeof config !== 'object') continue;
        const primary = Array.isArray(config.primary) ? config.primary : [];
        const secondary = Array.isArray(config.secondary) ? config.secondary : [];
        const always = Array.isArray(config.always) ? config.always : [];
        const contextual =
          config.contextual && typeof config.contextual === 'object'
            ? Object.values(config.contextual).flat()
            : [];
        const allSkills = [...new Set([...primary, ...always, ...secondary, ...contextual])];
        agentToSkills[agentId] = allSkills;

        for (const skillName of primary) {
          if (!skillToAgents[skillName])
            skillToAgents[skillName] = { agentPrimary: [], agentSupporting: [] };
          if (!skillToAgents[skillName].agentPrimary.includes(agentId)) {
            skillToAgents[skillName].agentPrimary.push(agentId);
          }
        }
        for (const skillName of always) {
          if (!skillToAgents[skillName])
            skillToAgents[skillName] = { agentPrimary: [], agentSupporting: [] };
          if (!skillToAgents[skillName].agentPrimary.includes(agentId)) {
            skillToAgents[skillName].agentPrimary.push(agentId);
          }
        }
        for (const skillName of secondary) {
          if (!skillToAgents[skillName])
            skillToAgents[skillName] = { agentPrimary: [], agentSupporting: [] };
          if (!skillToAgents[skillName].agentSupporting.includes(agentId)) {
            skillToAgents[skillName].agentSupporting.push(agentId);
          }
        }
        for (const skillName of contextual) {
          if (!skillToAgents[skillName])
            skillToAgents[skillName] = { agentPrimary: [], agentSupporting: [] };
          if (!skillToAgents[skillName].agentSupporting.includes(agentId)) {
            skillToAgents[skillName].agentSupporting.push(agentId);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not load agent-skill-matrix: ${err.message}`);
  }

  return { skillToAgents, agentToSkills };
}

/**
 * Parse skill catalog to extract skill names
 */
function parseSkillCatalog() {
  const skills = [];

  try {
    const existingCatalogPath = fs.existsSync(CATALOG_PATH)
      ? CATALOG_PATH
      : fs.existsSync(CATALOG_PATH_LEGACY)
        ? CATALOG_PATH_LEGACY
        : null;

    if (existingCatalogPath) {
      const content = fs.readFileSync(existingCatalogPath, 'utf8');

      // Extract skill names from table rows (allowing for padding spaces)
      const skillPattern = /\|\s*`([^`]+)`\s*\|/g;
      let match;

      while ((match = skillPattern.exec(content)) !== null) {
        const skillName = match[1].replace(/~~/g, ''); // Remove strikethrough
        if (!skillName.startsWith('~~')) {
          skills.push(skillName);
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not parse skill catalog: ${err.message}`);
  }

  return [...new Set(skills)]; // Remove duplicates
}

/**
 * Scan SKILL.md files for metadata (shallow - only direct children)
 * @deprecated Use scanSkillFilesRecursively for nested skill directories
 */
function scanSkillFiles() {
  const skills = {};

  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      return skills;
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');

        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, 'utf8');

          // Extract frontmatter if exists
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

          skills[entry.name] = {
            name: entry.name,
            hasSkillFile: true,
            hasFrontmatter: !!frontmatterMatch,
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not scan skill files: ${err.message}`);
  }

  return skills;
}

function isArchivedSkillName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return false;
  }
  return /(^|\/)(?:_archive|archive|dead)(?:\/|$)/.test(name);
}
/**
 * Recursively scan all SKILL.md files, preserving full relative paths.
 * Fixes SKL-001: handles nested directories like scientific-skills/skills/biopython
 *
 * @param {string} baseDir - The base skills directory to scan
 * @param {string} relativePath - Current relative path from baseDir (used in recursion)
 * @returns {Object} Map of skill key (relative path) to skill metadata
 */
function scanSkillFilesRecursively(baseDir, relativePath = '') {
  const skills = {};
  const currentDir = relativePath ? path.join(baseDir, relativePath) : baseDir;

  try {
    if (!fs.existsSync(currentDir)) {
      return skills;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Build the relative path for this entry
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        const skillPath = path.join(currentDir, entry.name, 'SKILL.md');

        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, 'utf8');

          // Extract frontmatter if exists
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let description = null;
          let tools = null;

          if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const descMatch = yaml.match(/^description:\s*(.*)$/m);
            if (descMatch) {
              const rawDesc = descMatch[1].trim();
              // Handle YAML block scalars (>-, >-, |-, |)
              if (/^[>|]-?$/.test(rawDesc)) {
                // Collect indented continuation lines after the block scalar indicator
                const afterDesc = yaml.slice(descMatch.index + descMatch[0].length);
                const continuationLines = [];
                for (const line of afterDesc.split('\n')) {
                  if (/^\s{2,}/.test(line)) {
                    continuationLines.push(line.trim());
                  } else if (line.trim() === '') {
                    // Blank lines within block scalar are preserved
                    continue;
                  } else {
                    break; // Non-indented, non-empty line ends the block
                  }
                }
                description = continuationLines.join(' ').trim() || null;
              } else {
                description = rawDesc.replace(/^["'](.*)["']$/, '$1').trim();
              }
            }

            const toolsMatch = yaml.match(/^tools:\s*\[(.*)\]/m);
            if (toolsMatch) {
              tools = toolsMatch[1]
                .split(',')
                .map(t => t.trim().replace(/^["'](.*)["']$/, '$1'))
                .filter(Boolean);
            }
          }

          // Use forward slashes for consistent keys (cross-platform)
          let skillKey = entryRelativePath.replace(/\\/g, '/');

          // Fix SKL-002: Remove intermediate '/skills/' directories from nested skills
          // e.g. 'scientific-skills/skills/rdkit' -> 'scientific-skills/rdkit'
          skillKey = skillKey.replace(/\/skills\//g, '/');

          // Extract provenance fields for ArXiv [2504.19951]+[2602.14798] tool-squatting defense
          const yaml2 = frontmatterMatch ? frontmatterMatch[1] : '';
          const srcM = yaml2.match(/^source:\s*(.+)$/m);
          const tsM = yaml2.match(/^trust_score:\s*(\d+)$/m);
          const shaM = yaml2.match(/^provenance_sha:\s*([0-9a-fA-F]{16})$/m);

          skills[skillKey] = {
            name: skillKey,
            hasSkillFile: true,
            hasFrontmatter: !!frontmatterMatch,
            description,
            tools,
            provenanceSource: srcM ? srcM[1].trim() : null,
            provenanceTrustScore: tsM ? parseInt(tsM[1], 10) : null,
            provenanceSha: shaM ? shaM[1].trim() : null,
          };

          // Stop recursing if this is already a full skill to avoid phantom sub-skills in its subdirectories
          continue;
        }

        // Recursively scan subdirectories if no SKILL.md found at this level
        const nestedSkills = scanSkillFilesRecursively(baseDir, entryRelativePath);
        Object.assign(skills, nestedSkills);
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not scan skill files in ${currentDir}: ${err.message}`);
  }

  return skills;
}

function canonicalSkillLookupKey(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return name;
  }
  if (name.startsWith('creators/')) {
    const parts = name.split('/');
    return parts[parts.length - 1] || name;
  }
  return name;
}

function resolveIndexInputs(options = {}) {
  const {
    scan = true,
    catalogSkillsOverride = null,
    scannedSkillsOverride = null,
    skillToAgentsOverride = null,
    agentToSkillsOverride = null,
    includeArchived = false,
  } = options;

  const catalogSkills = Array.isArray(catalogSkillsOverride)
    ? catalogSkillsOverride
    : parseSkillCatalog();
  const scannedSkills =
    scannedSkillsOverride && typeof scannedSkillsOverride === 'object'
      ? scannedSkillsOverride
      : scan
        ? scanSkillFilesRecursively(SKILLS_DIR)
        : {};
  const scannedSkillCount = Object.keys(scannedSkills).length;

  const filteredCatalogSkills = includeArchived
    ? catalogSkills
    : catalogSkills.filter(name => !isArchivedSkillName(name));
  const filteredScannedSkillNames = includeArchived
    ? Object.keys(scannedSkills)
    : Object.keys(scannedSkills).filter(name => !isArchivedSkillName(name));

  const { skillToAgents, agentToSkills } = loadAgentSkillMatrix();
  const resolvedSkillToAgents =
    skillToAgentsOverride && typeof skillToAgentsOverride === 'object'
      ? skillToAgentsOverride
      : skillToAgents;
  const resolvedAgentToSkills =
    agentToSkillsOverride && typeof agentToSkillsOverride === 'object'
      ? agentToSkillsOverride
      : agentToSkills;

  return {
    catalogSkills,
    scannedSkillCount,
    filteredCatalogSkills,
    filteredScannedSkillNames,
    resolvedSkillToAgents,
    resolvedAgentToSkills,
    includeArchived,
    scannedSkills, // Add this
  };
}

function buildCreatorAliasMap(filteredScannedSkillNames) {
  const creatorAliasToNested = {};
  for (const scannedName of filteredScannedSkillNames) {
    const canonical = canonicalSkillLookupKey(scannedName);
    if (canonical !== scannedName && !creatorAliasToNested[canonical]) {
      creatorAliasToNested[canonical] = scannedName;
    }
  }
  return creatorAliasToNested;
}

function resolveAgentsForSkill(name, canonicalName, resolvedSkillToAgents) {
  const mappedAgents = resolvedSkillToAgents[name] || resolvedSkillToAgents[canonicalName];
  if (mappedAgents) {
    return {
      agentPrimary: mappedAgents.agentPrimary || [],
      agentSupporting: mappedAgents.agentSupporting || [],
    };
  }

  const agentPrimary = [];
  const agentSupporting = [];
  for (const [agent, skillList] of Object.entries(AGENT_SKILLS)) {
    const matchedSkillName = skillList.includes(name)
      ? name
      : skillList.includes(canonicalName)
        ? canonicalName
        : null;
    if (!matchedSkillName) {
      continue;
    }
    if (skillList.indexOf(matchedSkillName) < 3) {
      agentPrimary.push(agent);
    } else {
      agentSupporting.push(agent);
    }
  }
  return { agentPrimary, agentSupporting };
}

function buildSkillEntry(name, creatorAliasToNested, resolvedSkillToAgents, scannedSkills = {}) {
  const canonicalName = canonicalSkillLookupKey(name);
  const domain = DOMAIN_MAP[name] || DOMAIN_MAP[canonicalName] || 'other';
  const category = CATEGORY_MAP[name] || CATEGORY_MAP[canonicalName] || 'Other';

  // Extract metadata from scanned SKILL.md if available
  const scannedMetadata = scannedSkills[name] || scannedSkills[canonicalName] || {};

  const requiredTools = scannedMetadata.tools ||
    SKILL_TOOLS[name] ||
    SKILL_TOOLS[canonicalName] || ['Read', 'Write', 'Edit'];

  const { agentPrimary, agentSupporting } = resolveAgentsForSkill(
    name,
    canonicalName,
    resolvedSkillToAgents
  );
  const aliasOf = creatorAliasToNested[name] || null;

  // Description Priority:
  // 1. Scanned frontmatter (Source of Truth)
  // 2. Definitions map (Override)
  // 3. Category fallback
  const description =
    scannedMetadata.description ||
    SKILL_DESCRIPTION_MAP[name] ||
    SKILL_DESCRIPTION_MAP[canonicalName] ||
    `${category} - ${name}`;

  const tags = [...new Set([domain, category.toLowerCase().replace(/\s+/g, '-'), name])];

  return {
    name,
    displayName: name
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    category,
    domain,
    description,
    requiredTools,
    agentPrimary: agentPrimary.length > 0 ? agentPrimary : ['developer'],
    agentSupporting,
    tags,
    priority: agentPrimary.length > 0 ? 1 : 3,
    aliasOf,
  };
}

function buildIndexes(skills, resolvedAgentToSkills) {
  const byDomain = {};
  const byCategory = {};
  const byTool = {};
  const byAgent = {};

  for (const [name, skill] of Object.entries(skills)) {
    if (!byDomain[skill.domain]) {
      byDomain[skill.domain] = [];
    }
    byDomain[skill.domain].push(name);

    if (!byCategory[skill.category]) {
      byCategory[skill.category] = [];
    }
    byCategory[skill.category].push(name);

    for (const tool of skill.requiredTools) {
      if (!byTool[tool]) {
        byTool[tool] = [];
      }
      byTool[tool].push(name);
    }
  }

  const agentSource =
    Object.keys(resolvedAgentToSkills).length > 0 ? resolvedAgentToSkills : AGENT_SKILLS;
  for (const [agent, skillList] of Object.entries(agentSource)) {
    const filtered = Array.isArray(skillList)
      ? skillList.filter(skillName => Object.prototype.hasOwnProperty.call(skills, skillName))
      : [];
    byAgent[agent] = [...new Set(filtered)];
  }

  for (const [skillName, skill] of Object.entries(skills)) {
    const assignedAgents = [...(skill.agentPrimary || []), ...(skill.agentSupporting || [])];
    for (const agent of assignedAgents) {
      if (!byAgent[agent]) {
        byAgent[agent] = [];
      }
      if (!byAgent[agent].includes(skillName)) {
        byAgent[agent].push(skillName);
      }
    }
  }

  return { byDomain, byCategory, byTool, byAgent };
}

function logGeneratedIndexSummary(verbose, index) {
  if (!verbose) {
    return;
  }

  const generatedSkillCount = Object.keys(index.skills).length;
  const generatedDomainCount = Object.keys(index.index.byDomain).length;
  const generatedCategoryCount = Object.keys(index.index.byCategory).length;
  const generatedToolMappingCount = Object.keys(index.index.byTool).length;
  const generatedAgentAssignmentCount = Object.keys(index.index.byAgent).length;

  console.log('Generated index with:');
  console.log(`  - ${generatedSkillCount} skills`);
  console.log(`  - ${generatedDomainCount} domains`);
  console.log(`  - ${generatedCategoryCount} categories`);
  console.log(`  - ${generatedToolMappingCount} tool mappings`);
  console.log(`  - ${generatedAgentAssignmentCount} agent assignments`);
}
/**
 * Recursively collect all *.md files under a directory (non-archived).
 * Returns an array of absolute file paths.
 */
function collectAgentManifests(dir) {
  const manifests = [];
  try {
    if (!fs.existsSync(dir)) return manifests;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        manifests.push(...collectAgentManifests(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'CLAUDE.md') {
        manifests.push(fullPath);
      }
    }
  } catch (_err) {
    // Non-fatal: skip unreadable entries
  }
  return manifests;
}

/**
 * Parse an agent manifest file and extract the `skills:` YAML array.
 * Only handles the simple inline list style used in agent frontmatter.
 * Returns { agentId, skills[] } or null if no skills array found.
 */
function parseAgentManifestSkills(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;
    const yaml = fmMatch[1];

    // Match the `skills:` block — list items (`  - skillname`)
    const skillsBlockMatch = yaml.match(/^skills:\s*\n((?:[ \t]+-[^\n]*\n?)*)/m);
    if (!skillsBlockMatch) return null;

    const lines = skillsBlockMatch[1].split('\n');
    const skills = [];
    for (const line of lines) {
      const m = line.match(/^\s+-\s+(.+)/);
      if (m) skills.push(m[1].trim());
    }

    if (skills.length === 0) return null;

    // Derive agent id from filename (strip .md)
    const agentId = path.basename(filePath, '.md');
    return { agentId, skills };
  } catch (_err) {
    return null;
  }
}

/**
 * Audit all agent manifests under AGENTS_DIR for unresolvable {skill.*} tokens.
 * Read-only — does not mutate any files.
 * Returns an array of warning strings.
 */
function auditAllAgentManifests(skillsRegistry) {
  const allWarnings = [];
  const manifests = collectAgentManifests(AGENTS_DIR);
  for (const filePath of manifests) {
    const parsed = parseAgentManifestSkills(filePath);
    if (!parsed) continue;
    const warnings = auditAgentSkillRefs(parsed.agentId, parsed.skills, skillsRegistry);
    allWarnings.push(...warnings);
  }
  return allWarnings;
}

/**
 * Generate the skill index
 */
function generateIndex(options = {}) {
  const { verbose = false } = options;
  const {
    catalogSkills,
    scannedSkillCount,
    filteredCatalogSkills,
    filteredScannedSkillNames,
    resolvedSkillToAgents,
    resolvedAgentToSkills,
    includeArchived,
    scannedSkills, // Use this
  } = resolveIndexInputs(options);

  if (verbose) {
    console.log(`Found ${catalogSkills.length} skills in catalog`);
    console.log(`Found ${scannedSkillCount} skill directories`);
  }

  const skills = {};
  const creatorAliasToNested = buildCreatorAliasMap(filteredScannedSkillNames);

  const allSkillNames = new Set([
    ...filteredCatalogSkills,
    ...filteredScannedSkillNames,
    ...Object.keys(DOMAIN_MAP),
    ...Object.keys(creatorAliasToNested),
  ]);

  for (const name of allSkillNames) {
    skills[name] = buildSkillEntry(
      name,
      creatorAliasToNested,
      resolvedSkillToAgents,
      scannedSkills
    );
  }

  const { byDomain, byCategory, byTool, byAgent } = buildIndexes(skills, resolvedAgentToSkills);

  const index = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalSkills: Object.keys(skills).length,
      totalDomains: Object.keys(byDomain).length,
      totalCategories: Object.keys(byCategory).length,
      lastValidated: new Date().toISOString(),
      source: '.claude/docs/skill-catalog.md',
      archivedIncluded: includeArchived,
    },
    skills,
    index: {
      byDomain,
      byCategory,
      byTool,
      byAgent,
    },
    discovery: {
      maxSkillsPerDomain: 50,
      maxSkillsInPrompt: 20,
      recommendedForAgent: byAgent,
    },
  };

  logGeneratedIndexSummary(verbose, index);

  return index;
}

/**
 * Resolve scan mode from CLI args.
 * Default is comprehensive scan unless --quick is provided.
 */
function resolveScanMode(args = []) {
  if (!Array.isArray(args)) {
    return true;
  }
  if (args.includes('--quick')) {
    return false;
  }
  if (args.includes('--scan')) {
    return true;
  }
  return true;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate');
  const verbose = args.includes('--verbose');
  const scan = resolveScanMode(args);

  console.log('Skill Index Generator');
  console.log('=====================\n');

  if (validateOnly) {
    console.log('Validating existing index...\n');

    if (!fs.existsSync(INDEX_PATH)) {
      console.error(`Error: Index not found at ${INDEX_PATH}`);
      process.exit(1);
    }

    const result = validateIndex(INDEX_PATH);

    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (result.valid) {
      console.log('\nIndex is valid!');
      process.exit(0);
    } else {
      console.log('\nIndex validation failed.');
      process.exit(1);
    }
  }

  // Provenance validation gate — every SKILL.md must have source, trust_score, provenance_sha
  // Validates ArXiv [2504.19951] + [2602.14798] against tool-squatting
  if (scan) {
    const {
      validateSkillProvenance: _validateProv,
    } = require('../../lib/validation/skill-provenance.cjs');
    const scannedForProv = scanSkillFilesRecursively(SKILLS_DIR);
    const missingProv = [];
    for (const [skillKey, meta] of Object.entries(scannedForProv)) {
      if (isArchivedSkillName(skillKey)) continue;
      const result = _validateProv(
        {
          source: meta.provenanceSource,
          trust_score: meta.provenanceTrustScore,
          provenance_sha: meta.provenanceSha,
        },
        skillKey + '/SKILL.md'
      );
      if (!result.valid) missingProv.push({ skillKey, errors: result.errors });
    }
    if (missingProv.length > 0) {
      console.error('\nProvenance validation FAILED — missing fields in SKILL.md files:');
      for (const { skillKey, errors } of missingProv) {
        console.error(`\n  ${skillKey}/SKILL.md:`);
        for (const err of errors) console.error(`    - ${err}`);
      }
      console.error(`\n${missingProv.length} skill(s) missing provenance fields.`);
      console.error(
        'Run: node .claude/tools/cli/skills-provenance-migrate.cjs to add them automatically.'
      );
      process.exit(1);
    }
  }

  // Generate index
  const index = generateIndex({ verbose, scan });

  if (dryRun) {
    console.log('Dry run - index would be written to:');
    console.log(`  ${INDEX_PATH}\n`);
    console.log('Preview:');
    console.log(JSON.stringify(index, null, 2).slice(0, 2000) + '...\n');
    console.log(`Total size: ${JSON.stringify(index).length} bytes`);
    return;
  }

  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Write index
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n');

  console.log(`Index generated successfully!`);
  console.log(`Output: ${INDEX_PATH}`);
  console.log(`\nStatistics:`);
  console.log(`  - Skills: ${index.metadata.totalSkills}`);
  console.log(`  - Domains: ${index.metadata.totalDomains}`);
  console.log(`  - Categories: ${index.metadata.totalCategories}`);

  // Validate generated index
  const validation = validateIndex(INDEX_PATH);
  if (!validation.valid) {
    console.log('\nWarning: Generated index has validation issues:');
    validation.errors.forEach(e => console.log(`  - ${e}`));
  }

  // TR-001: Audit agent manifests for unresolvable {skill.*} token references
  // Build a flat skills registry from the generated index for lookup
  const skillsRegistry = {};
  for (const skillName of Object.keys(index.skills)) {
    skillsRegistry[skillName] = skillName;
  }
  const refAuditWarnings = auditAllAgentManifests(skillsRegistry);
  if (refAuditWarnings.length > 0) {
    console.log('\nRef-audit: unresolvable {skill.*} references in agent manifests:');
    refAuditWarnings.forEach(w => console.log(`  [WARN] ${w}`));
    console.log(
      `\n${refAuditWarnings.length} unresolvable ref(s) found (warnings only — index generation succeeded).`
    );
  }
}

// Run if called directly
const wrappedMain = wrapCLITool(main, 'generate-skill-index');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  generateIndex,
  validateIndex,
  resolveScanMode,
  isArchivedSkillName,
  parseSkillCatalog,
  scanSkillFiles,
  scanSkillFilesRecursively,
  auditAllAgentManifests,
  collectAgentManifests,
  parseAgentManifestSkills,
};
