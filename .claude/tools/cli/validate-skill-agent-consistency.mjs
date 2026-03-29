#!/usr/bin/env node
// Agent: developer | Task: #16 | Session: 2026-02-21

/**
 * validate-skill-agent-consistency.mjs
 *
 * Compares skill-catalog.md, skill-index.json, and agent .md frontmatter
 * to detect registration drift across three authoritative data sources.
 * CI-gate-ready (exits non-zero on errors).
 *
 * Usage: node .claude/tools/cli/validate-skill-agent-consistency.mjs [options]
 *
 * Options:
 *   --strict       Treat warnings as errors (exit 1 on any finding)
 *   --json         Output as JSON instead of text
 *   --skill <name> Check only a specific skill
 *   --verbose      Show passing checks too
 *   --help         Show usage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CATALOG_PATH = path.join(PROJECT_ROOT, '.claude', 'docs', 'skill-catalog.md');
const INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_MODE = args.includes('--json');
const VERBOSE = args.includes('--verbose');
const HELP = args.includes('--help') || args.includes('-h');
const SKILL_FILTER_IDX = args.indexOf('--skill');
const SKILL_FILTER = SKILL_FILTER_IDX !== -1 ? args[SKILL_FILTER_IDX + 1] : null;

if (HELP) {
  console.log(`
Usage: node .claude/tools/cli/validate-skill-agent-consistency.mjs [options]

Detects skill/agent registration gaps by comparing three data sources:
  1. skill-catalog.md  (Primary Agents column)
  2. skill-index.json  (agentPrimary arrays)
  3. agent .md files   (skills: frontmatter arrays)

Options:
  --strict           Treat warnings as errors (exit 1 on any finding)
  --json             Output as JSON instead of text
  --skill <name>     Check only a specific skill
  --verbose          Show all skills including passing checks
  --help, -h         Show this help message

Exit Codes:
  0  All checks pass
  1  Errors found (or warnings with --strict)
  2  Tool execution failure (missing files, parse error)
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Parse: Skill Catalog
// ---------------------------------------------------------------------------

/**
 * Normalise the "Primary Agents" cell from a catalog table row.
 * Wildcards ("all agents", "36+ agents", "(all domain agents)") → ['*']
 */
function parseAgentCell(cell) {
  if (!cell || cell.trim() === '' || cell.trim() === '-') return [];
  const normalised = cell.trim();
  if (/all agents/i.test(normalised)) return ['*'];
  if (/\d+\+\s*agents/i.test(normalised)) return ['*'];
  if (/\(all [^)]*\)/i.test(normalised)) return ['*'];
  if (/all creators/i.test(normalised)) return ['*'];
  if (/^all\s/i.test(normalised)) return ['*'];
  return normalised
    .split(',')
    .map(a => a.trim())
    .filter(a => a.length > 0 && !a.startsWith('('));
}

/**
 * Parse skill-catalog.md and return Map<skillName, agentNames[]>
 * Handles table rows of the form:
 *   | `skill-name` | Description text | agent1, agent2 |
 * The column order may vary — Description before Agents, or Agents before Description.
 * We anchor on the backtick-quoted skill name and treat the LAST non-empty cell as agents.
 */
function parseCatalog(catalogPath) {
  const skillAgentMap = new Map();

  if (!fs.existsSync(catalogPath)) {
    return { skillAgentMap, error: `Catalog not found: ${catalogPath}` };
  }

  const content = fs.readFileSync(catalogPath, 'utf8');

  // Match markdown table rows containing a backtick-quoted skill name:
  //   | `skill-name` | ... | agents |
  // Allow ~~strikethrough~~ notation on the skill name → skip deprecated skills
  const rowPattern = /\|\s*(~~)?`([^`]+)`(~~)?\s*\|([^|]+)\|([^|\n]+)\|/g;

  let match;
  while ((match = rowPattern.exec(content)) !== null) {
    const isDeprecated = Boolean(match[1]) || Boolean(match[3]);
    if (isDeprecated) continue;

    const skillName = match[2].trim();
    // The last captured cell is the "Primary Agents" column
    const lastCell = match[5];

    const agents = parseAgentCell(lastCell);
    skillAgentMap.set(skillName, agents);
  }

  return { skillAgentMap };
}

// ---------------------------------------------------------------------------
// Parse: Skill Index
// ---------------------------------------------------------------------------

/**
 * Parse skill-index.json and return Map<skillName, {agentPrimary, agentSupporting, aliasOf}>
 */
function parseSkillIndex(indexPath) {
  const skillMap = new Map();

  if (!fs.existsSync(indexPath)) {
    return { skillMap, error: `Skill index not found: ${indexPath}` };
  }

  let raw;
  try {
    raw = fs.readFileSync(indexPath, 'utf8');
  } catch (e) {
    return { skillMap, error: `Failed to read skill index: ${e.message}` };
  }

  let index;
  try {
    index = JSON.parse(raw);
  } catch (e) {
    return { skillMap, error: `Failed to parse skill index JSON: ${e.message}` };
  }

  for (const [name, entry] of Object.entries(index.skills || {})) {
    skillMap.set(name, {
      agentPrimary: Array.isArray(entry.agentPrimary) ? entry.agentPrimary : [],
      agentSupporting: Array.isArray(entry.agentSupporting) ? entry.agentSupporting : [],
      aliasOf: entry.aliasOf || null,
    });
  }

  return { skillMap };
}

// ---------------------------------------------------------------------------
// Parse: Agent Files (frontmatter)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object with the parsed fields, or null on failure.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  const lines = yaml.split('\n');
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (line.match(/^[a-z_]+:/i)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        inArray = false;
      } else {
        result[currentKey] = value;
        inArray = false;
      }
    } else if (inArray && line.match(/^\s+-\s/)) {
      if (!result[currentKey]) result[currentKey] = [];
      result[currentKey].push(line.replace(/^\s+-\s/, '').trim());
    }
  }

  return result;
}

/**
 * Recursively scan agent files, skipping _archive directories.
 * Returns Array<{fullPath, name, frontmatter}>
 */
function scanAgentFiles(dir) {
  const agents = [];

  function scan(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_archive') continue;
        scan(fullPath);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const fm = parseFrontmatter(content);
          if (fm && fm.name) {
            agents.push({ fullPath, name: fm.name, frontmatter: fm });
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  if (fs.existsSync(dir)) {
    scan(dir);
  }

  return agents;
}

/**
 * Build two maps from agent files:
 * - agentToSkills: Map<agentName, skillName[]>   (what each agent claims to use)
 * - skillToAgents: Map<skillName, agentName[]>   (which agents list each skill)
 */
function buildAgentSkillMaps(agentsDir) {
  const agents = scanAgentFiles(agentsDir);
  const agentToSkills = new Map();
  const skillToAgents = new Map();

  for (const agent of agents) {
    const skills = Array.isArray(agent.frontmatter.skills) ? agent.frontmatter.skills : [];
    agentToSkills.set(agent.name, skills);

    for (const skill of skills) {
      if (!skillToAgents.has(skill)) skillToAgents.set(skill, []);
      skillToAgents.get(skill).push(agent.name);
    }
  }

  return { agentToSkills, skillToAgents, agents };
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normaliseAgent(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Five Checks
// ---------------------------------------------------------------------------

/**
 * Check 1: Catalog vs Index primary agent mismatch → ERROR
 */
function checkCatalogVsIndex(catalogMap, indexMap, skillFilter) {
  const findings = [];

  for (const [skill, catalogAgents] of catalogMap.entries()) {
    if (skillFilter && skill !== skillFilter) continue;
    if (catalogAgents.includes('*')) continue; // wildcard — skip

    const indexEntry = indexMap.get(skill);
    if (!indexEntry) continue; // handled by check 5 (ghost) or orphan

    const indexAgents = indexEntry.agentPrimary;
    if (indexEntry.aliasOf) continue; // aliases are OK

    const inCatalogNotIndex = catalogAgents.filter(
      a => !indexAgents.map(normaliseAgent).includes(normaliseAgent(a))
    );
    const inIndexNotCatalog = indexAgents.filter(
      a => !catalogAgents.map(normaliseAgent).includes(normaliseAgent(a))
    );

    if (inCatalogNotIndex.length > 0 || inIndexNotCatalog.length > 0) {
      const details = [];
      if (inCatalogNotIndex.length > 0) {
        details.push(`in catalog not in index: [${inCatalogNotIndex.join(', ')}]`);
      }
      if (inIndexNotCatalog.length > 0) {
        details.push(`in index not in catalog: [${inIndexNotCatalog.join(', ')}]`);
      }
      findings.push({
        skill,
        check: 'catalog-index-mismatch',
        severity: 'ERROR',
        detail: `catalog says [${catalogAgents.join(', ')}] but index says [${indexAgents.join(', ')}]. ${details.join('; ')}`,
      });
    }
  }

  return findings;
}

/**
 * Check 2: Agent file vs Index skills array mismatch → WARNING
 * Agent claims skill X but index doesn't list agent as primary.
 */
function checkAgentFileVsIndex(agentToSkills, indexMap, skillFilter) {
  const findings = [];

  for (const [agentName, skills] of agentToSkills.entries()) {
    for (const skill of skills) {
      if (skillFilter && skill !== skillFilter) continue;

      const indexEntry = indexMap.get(skill);
      if (!indexEntry) continue; // will be caught by ghost-skill check

      const allIndexAgents = [...indexEntry.agentPrimary, ...indexEntry.agentSupporting].map(
        normaliseAgent
      );

      if (!allIndexAgents.includes(normaliseAgent(agentName))) {
        findings.push({
          skill,
          check: 'agent-not-in-index',
          severity: 'WARNING',
          detail: `${agentName}.md lists skill '${skill}' in frontmatter but agent is not in index agentPrimary or agentSupporting`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check 3: Agent file vs Catalog mismatch → WARNING
 * Agent has skill X in frontmatter but catalog lists different primary agents.
 */
function checkAgentFileVsCatalog(agentToSkills, catalogMap, skillFilter) {
  const findings = [];

  for (const [agentName, skills] of agentToSkills.entries()) {
    for (const skill of skills) {
      if (skillFilter && skill !== skillFilter) continue;

      const catalogAgents = catalogMap.get(skill);
      if (!catalogAgents) continue; // will be caught by ghost-skill check

      if (catalogAgents.includes('*')) continue; // wildcard

      const normCatalog = catalogAgents.map(normaliseAgent);
      if (!normCatalog.includes(normaliseAgent(agentName))) {
        findings.push({
          skill,
          check: 'agent-not-in-catalog',
          severity: 'WARNING',
          detail: `${agentName}.md lists skill '${skill}' but catalog primary agents are [${catalogAgents.join(', ')}]`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check 4: Orphaned skills → WARNING
 * Skill in catalog or index but no agent .md file lists it.
 */
function checkOrphanedSkills(catalogMap, indexMap, skillToAgents, skillFilter) {
  const findings = [];
  const allSkills = new Set([...catalogMap.keys(), ...indexMap.keys()]);

  for (const skill of allSkills) {
    if (skillFilter && skill !== skillFilter) continue;

    const catalogAgents = catalogMap.get(skill) || [];
    const indexEntry = indexMap.get(skill);

    // Skip wildcards
    if (catalogAgents.includes('*')) continue;

    // Skip aliases
    if (indexEntry && indexEntry.aliasOf) continue;

    const agentFiles = skillToAgents.get(skill) || [];

    if (agentFiles.length === 0) {
      // Double check: if index has agents listed, it's not really orphaned from index perspective
      const indexPrimary = indexEntry ? indexEntry.agentPrimary : [];
      if (indexPrimary.length === 0 && catalogAgents.length === 0) {
        findings.push({
          skill,
          check: 'orphaned',
          severity: 'WARNING',
          detail: `listed in catalog/index but no agent .md file includes it in skills array`,
        });
      } else if (agentFiles.length === 0) {
        findings.push({
          skill,
          check: 'orphaned',
          severity: 'WARNING',
          detail: `listed in catalog/index but no agent .md file includes it in skills array (index primary: [${indexPrimary.join(', ')}])`,
        });
      }
    }
  }

  return findings;
}

/**
 * Check 5: Ghost skills → ERROR
 * Skill referenced by agents or index but no SKILL.md exists on disk.
 */
function checkGhostSkills(catalogMap, indexMap, agentToSkills, skillFilter) {
  const findings = [];

  // Gather all skill references
  const allReferenced = new Set([...catalogMap.keys(), ...indexMap.keys()]);
  for (const skills of agentToSkills.values()) {
    for (const s of skills) allReferenced.add(s);
  }

  for (const skill of allReferenced) {
    if (skillFilter && skill !== skillFilter) continue;

    // Skip aliases from index
    const indexEntry = indexMap.get(skill);
    if (indexEntry && indexEntry.aliasOf) continue;

    // Try multiple possible paths for nested skills
    // 1. Direct path: .claude/skills/{skill}/SKILL.md
    // 2. Nested path with 'skills' subdir (for scientific-skills/*): .claude/skills/{parent}/skills/{name}/SKILL.md
    const directPath = path.join(SKILLS_DIR, skill, 'SKILL.md');

    // For nested skills like scientific-skills/rdkit, also check scientific-skills/skills/rdkit
    const parts = skill.split('/');
    const nestedPath =
      parts.length >= 2
        ? path.join(SKILLS_DIR, parts[0], 'skills', parts.slice(1).join('/'), 'SKILL.md')
        : null;

    // Also check archive
    const archivePath = path.join(SKILLS_DIR, '_archive', skill, 'SKILL.md');

    const skillExists =
      fs.existsSync(directPath) ||
      (nestedPath && fs.existsSync(nestedPath)) ||
      fs.existsSync(archivePath);

    if (!skillExists) {
      // Check if maybe the skill directory exists under a sub-path
      const relPath = `.claude/skills/${skill}/SKILL.md`;
      findings.push({
        skill,
        check: 'ghost-skill',
        severity: 'ERROR',
        detail: `referenced in catalog/index/agent files but no SKILL.md found at ${relPath}`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatTextReport(allFindings, stats) {
  const errors = allFindings.filter(f => f.severity === 'ERROR');
  const warnings = allFindings.filter(f => f.severity === 'WARNING');

  const lines = [];
  lines.push('');
  lines.push('SKILL CONSISTENCY REPORT');
  lines.push('========================');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  if (errors.length > 0) {
    lines.push(`ERRORs (${errors.length}):`);
    for (const f of errors) {
      lines.push(`  \u2717 [${f.check}] '${f.skill}': ${f.detail}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`WARNINGs (${warnings.length}):`);
    for (const f of warnings) {
      lines.push(`  \u26a0 [${f.check}] '${f.skill}': ${f.detail}`);
    }
    lines.push('');
  }

  if (VERBOSE && allFindings.length === 0) {
    lines.push('All checks passed - no discrepancies found.');
    lines.push('');
  }

  lines.push(
    `SUMMARY: ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} across ${stats.skillsChecked} skills checked`
  );

  const exitCode = errors.length > 0 || (STRICT && warnings.length > 0) ? 1 : 0;
  lines.push(`Exit code: ${exitCode} (${exitCode === 0 ? 'clean' : 'errors found'})`);
  lines.push('');

  return lines.join('\n');
}

function formatJsonReport(allFindings, stats) {
  const errors = allFindings.filter(f => f.severity === 'ERROR');
  const warnings = allFindings.filter(f => f.severity === 'WARNING');
  const exitCode = errors.length > 0 || (STRICT && warnings.length > 0) ? 1 : 0;

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        skillsChecked: stats.skillsChecked,
        agentsChecked: stats.agentsChecked,
        errors: errors.length,
        warnings: warnings.length,
        exitCode,
      },
      findings: allFindings,
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // Load data sources
  const { skillAgentMap: catalogMap, error: catalogError } = parseCatalog(CATALOG_PATH);
  if (catalogError) {
    if (JSON_MODE) {
      console.error(JSON.stringify({ error: catalogError, exitCode: 2 }, null, 2));
    } else {
      console.error(`ERROR: ${catalogError}`);
    }
    process.exit(2);
  }

  const { skillMap: indexMap, error: indexError } = parseSkillIndex(INDEX_PATH);
  if (indexError) {
    if (JSON_MODE) {
      console.error(JSON.stringify({ error: indexError, exitCode: 2 }, null, 2));
    } else {
      console.error(`ERROR: ${indexError}`);
    }
    process.exit(2);
  }

  const { agentToSkills, skillToAgents, agents } = buildAgentSkillMaps(AGENTS_DIR);

  // Run five checks
  const check1 = checkCatalogVsIndex(catalogMap, indexMap, SKILL_FILTER);
  const check2 = checkAgentFileVsIndex(agentToSkills, indexMap, SKILL_FILTER);
  const check3 = checkAgentFileVsCatalog(agentToSkills, catalogMap, SKILL_FILTER);
  const check4 = checkOrphanedSkills(catalogMap, indexMap, skillToAgents, SKILL_FILTER);
  const check5 = checkGhostSkills(catalogMap, indexMap, agentToSkills, SKILL_FILTER);

  const allFindings = [...check1, ...check2, ...check3, ...check4, ...check5];

  const stats = {
    skillsChecked: SKILL_FILTER ? 1 : Math.max(catalogMap.size, indexMap.size),
    agentsChecked: agents.length,
  };

  // Output
  if (JSON_MODE) {
    console.log(formatJsonReport(allFindings, stats));
  } else {
    console.log(formatTextReport(allFindings, stats));
  }

  // Exit code
  const errors = allFindings.filter(f => f.severity === 'ERROR');
  const warnings = allFindings.filter(f => f.severity === 'WARNING');
  const exitCode = errors.length > 0 || (STRICT && warnings.length > 0) ? 1 : 0;
  process.exit(exitCode);
}

main();
