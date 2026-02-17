#!/usr/bin/env node

/**
 * MCP Discoverer Module
 * Discovers MCP servers and matches them to agent purposes.
 * Leverages existing mcp-converter tools for skill creation.
 *
 * Usage:
 *   import { discoverMcpMatches } from './mcp-discoverer.mjs';
 *   const matches = discoverMcpMatches({ name, description });
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find project root (Windows compatible)
function findProjectRoot() {
  let dir = __dirname;
  let prevDir = '';
  while (dir !== prevDir) {
    // Stop when we reach the root (dirname returns same path)
    // Check if this directory contains a .claude folder (project root)
    if (existsSync(join(dir, '.claude'))) return dir;
    prevDir = dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const ROOT = findProjectRoot();
const MCP_CONFIG_PATH = join(ROOT, '.claude', '.mcp.json');
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
const _MCP_CATALOG_PATH = join(ROOT, '.claude', 'tools', 'mcp-converter', 'mcp-catalog.yaml');

/**
 * MCP Server to Skill/Agent mapping
 * Maps MCP server names to relevant skills and agent types
 */
const MCP_SKILL_MAPPING = {
  github: {
    skills: ['github-ops', 'github-mcp', 'git-expert'],
    agents: ['developer', 'architect'],
    keywords: ['github', 'git', 'repository', 'pr', 'pull request', 'issue', 'commit'],
    toolPrefix: 'mcp__github__',
  },
  git: {
    skills: ['git-expert'],
    agents: ['developer'],
    keywords: ['git', 'version control', 'commit', 'branch', 'merge'],
    toolPrefix: 'mcp__git__',
  },
  filesystem: {
    skills: [], // Built-in, no skill needed
    agents: ['developer', 'architect', 'planner'],
    keywords: ['file', 'directory', 'read', 'write', 'path'],
    toolPrefix: 'mcp__filesystem__',
  },
  memory: {
    skills: ['memory'],
    agents: ['planner', 'architect'],
    keywords: ['memory', 'remember', 'context', 'store', 'retrieve'],
    toolPrefix: 'mcp__memory__',
  },
  'sequential-thinking': {
    skills: ['sequential-thinking'],
    agents: ['planner', 'architect'],
    keywords: ['think', 'reason', 'step', 'sequential', 'logic', 'analyze'],
    toolPrefix: 'mcp__sequential-thinking__',
  },
  sqlite: {
    skills: ['text-to-sql'],
    agents: ['developer', 'data-expert'],
    keywords: ['database', 'sql', 'sqlite', 'query', 'data'],
    toolPrefix: 'mcp__sqlite__',
  },
  postgres: {
    skills: ['text-to-sql', 'database-ops'],
    agents: ['developer', 'data-expert', 'architect'],
    keywords: ['database', 'sql', 'postgres', 'postgresql', 'query'],
    toolPrefix: 'mcp__postgres__',
  },
  slack: {
    skills: ['slack-notifications'],
    agents: ['incident-responder', 'devops'],
    keywords: ['slack', 'message', 'notify', 'alert', 'channel', 'communication'],
    toolPrefix: 'mcp__slack__',
  },
  sentry: {
    skills: ['sentry-monitoring'],
    agents: ['devops', 'incident-responder', 'devops-troubleshooter'],
    keywords: ['sentry', 'error', 'monitoring', 'exception', 'bug', 'crash'],
    toolPrefix: 'mcp__sentry__',
  },
  playwright: {
    skills: ['test-generator'],
    agents: ['qa', 'developer'],
    keywords: ['test', 'browser', 'automation', 'e2e', 'end-to-end', 'playwright'],
    toolPrefix: 'mcp__playwright__',
  },
  docker: {
    skills: ['docker-compose'],
    agents: ['devops', 'developer'],
    keywords: ['docker', 'container', 'image', 'compose', 'build'],
    toolPrefix: 'mcp__docker__',
  },
  kubernetes: {
    skills: ['kubernetes-flux'],
    agents: ['devops'],
    keywords: ['kubernetes', 'k8s', 'pod', 'deployment', 'cluster', 'helm'],
    toolPrefix: 'mcp__kubernetes__',
  },
  terraform: {
    skills: ['terraform-infra'],
    agents: ['devops', 'architect'],
    keywords: ['terraform', 'infrastructure', 'iac', 'provision', 'cloud'],
    toolPrefix: 'mcp__terraform__',
  },
  aws: {
    skills: ['aws-cloud-ops'],
    agents: ['devops', 'architect'],
    keywords: ['aws', 'amazon', 's3', 'ec2', 'lambda', 'cloud'],
    toolPrefix: 'mcp__aws__',
  },
  gcp: {
    skills: ['gcloud-cli'],
    agents: ['devops', 'architect'],
    keywords: ['gcp', 'google cloud', 'gcloud', 'bigquery', 'cloud'],
    toolPrefix: 'mcp__gcp__',
  },
};

/**
 * Load MCP configuration
 */
function loadMcpConfig() {
  try {
    if (!existsSync(MCP_CONFIG_PATH)) return { mcpServers: {} };
    return safeParseJSON(readFileSync(MCP_CONFIG_PATH, 'utf-8'));
  } catch {
    return { mcpServers: {} };
  }
}

/**
 * Get existing skills
 */
function getExistingSkills() {
  try {
    if (!existsSync(SKILLS_DIR)) return [];
    return readdirSync(SKILLS_DIR).filter(f => {
      const skillPath = join(SKILLS_DIR, f, 'SKILL.md');
      return existsSync(skillPath);
    });
  } catch {
    return [];
  }
}

/**
 * Check if a skill exists for an MCP server
 */
function findExistingSkill(mcpName) {
  const mapping = MCP_SKILL_MAPPING[mcpName];
  if (!mapping) return null;

  const existingSkills = getExistingSkills();

  for (const skillName of mapping.skills) {
    if (existingSkills.includes(skillName)) {
      return {
        name: skillName,
        path: join(SKILLS_DIR, skillName, 'SKILL.md'),
      };
    }
  }
  return null;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2);
  return new Set(words);
}

/**
 * Calculate match score between agent and MCP server
 */
function calculateMatchScore(agentKeywords, mcpKeywords) {
  let score = 0;
  for (const kw of mcpKeywords) {
    if (agentKeywords.has(kw)) score++;
    // Partial match for compound words
    for (const ak of agentKeywords) {
      if (ak.includes(kw) || kw.includes(ak)) score += 0.5;
    }
  }
  return score;
}

/**
 * Discover MCP servers that match an agent's purpose
 *
 * @param {Object} config - Configuration object
 * @param {string} config.name - Agent name
 * @param {string} config.description - Agent description
 * @param {string[]} [config.capabilities] - List of capabilities
 * @returns {Object} MCP discovery results
 */
export function discoverMcpMatches(config) {
  const { name = '', description = '', capabilities = [] } = config;

  const mcpConfig = loadMcpConfig();
  const configuredServers = Object.keys(mcpConfig.mcpServers || {});
  const existingSkills = getExistingSkills();

  // Extract agent keywords
  const allText = [name, description, ...capabilities].join(' ');
  const agentKeywords = extractKeywords(allText);

  const matches = [];
  const potentialMatches = [];

  // Check each configured MCP server
  for (const serverName of configuredServers) {
    const mapping = MCP_SKILL_MAPPING[serverName];

    if (!mapping) {
      // Unknown MCP server - could potentially be useful
      potentialMatches.push({
        server: serverName,
        reason: 'Unknown MCP server - manual review recommended',
        score: 0,
      });
      continue;
    }

    // Calculate match score
    const score = calculateMatchScore(agentKeywords, mapping.keywords);

    if (score > 0) {
      const existingSkill = findExistingSkill(serverName);

      matches.push({
        server: serverName,
        score,
        matchedKeywords: mapping.keywords.filter(kw => agentKeywords.has(kw)),
        toolPrefix: mapping.toolPrefix,
        existingSkill,
        suggestedSkills: mapping.skills.filter(s => !existingSkills.includes(s)),
        needsSkillCreation: !existingSkill && mapping.skills.length > 0,
        relevantAgents: mapping.agents,
      });
    }
  }

  // Sort by score
  matches.sort((a, b) => b.score - a.score);

  return {
    hasMatches: matches.length > 0,
    configuredServers,
    matches,
    potentialMatches,
    existingSkills,
  };
}

/**
 * Get MCP tools command for agent's tools list
 */
export function getMcpToolsRef(serverName) {
  const mapping = MCP_SKILL_MAPPING[serverName];
  if (!mapping) return `mcp__${serverName}__*`;
  return `${mapping.toolPrefix}*`;
}

/**
 * Get conversion command for creating skill from MCP
 */
export function getConversionCommand(serverName) {
  return `python .claude/tools/mcp-converter/mcp_analyzer.py --server ${serverName}`;
}

/**
 * Get all configured MCP servers
 */
export function getConfiguredServers() {
  const mcpConfig = loadMcpConfig();
  return Object.keys(mcpConfig.mcpServers || {});
}

// CLI usage - normalize paths for Windows compatibility
const scriptPath = process.argv[1] || '';
const isMain =
  import.meta.url === `file://${scriptPath}` ||
  import.meta.url === `file:///${scriptPath.replace(/\\/g, '/')}`;
if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
MCP Discoverer - Find MCP servers matching agent purpose

Usage:
  node mcp-discoverer.mjs --name "agent-name" --description "description"
  node mcp-discoverer.mjs --list  (list configured MCP servers)

Options:
  --name          Agent name
  --description   Agent description
  --list          List all configured MCP servers
  --json          Output as JSON
`);
    process.exit(0);
  }

  if (args.includes('--list')) {
    const servers = getConfiguredServers();
    console.log('\n📡 Configured MCP Servers:\n');
    for (const server of servers) {
      const mapping = MCP_SKILL_MAPPING[server];
      const existingSkill = findExistingSkill(server);
      console.log(`  ${server}`);
      if (mapping) {
        console.log(`    Skills: ${mapping.skills.join(', ') || '(built-in)'}`);
        console.log(`    Agents: ${mapping.agents.join(', ')}`);
        console.log(`    Existing: ${existingSkill ? '✅ ' + existingSkill.name : '❌ No skill'}`);
      } else {
        console.log(`    ⚠️  Unknown server - not in mapping`);
      }
      console.log('');
    }
    process.exit(0);
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') options.name = args[++i];
    if (args[i] === '--description') options.description = args[++i];
  }

  if (!options.name && !options.description) {
    console.error('Error: --name or --description required');
    process.exit(1);
  }

  const result = discoverMcpMatches(options);

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n🔍 MCP Discovery Results\n');
    console.log(`Configured servers: ${result.configuredServers.join(', ')}`);
    console.log(`Matches found: ${result.matches.length}`);

    if (result.hasMatches) {
      console.log('\n🔗 MATCHING MCP SERVERS:\n');
      for (const match of result.matches) {
        const status = match.existingSkill ? '✅' : '⚠️';
        console.log(`  ${status} ${match.server} (score: ${match.score})`);
        console.log(`    Matched: ${match.matchedKeywords.join(', ')}`);
        if (match.existingSkill) {
          console.log(`    Skill: ${match.existingSkill.name}`);
        } else if (match.suggestedSkills.length > 0) {
          console.log(`    Suggested: ${match.suggestedSkills.join(', ')}`);
          console.log(`    Convert: ${getConversionCommand(match.server)}`);
        }
        console.log(`    Tools ref: ${match.toolPrefix}*`);
        console.log('');
      }
    } else {
      console.log('\n✅ No matching MCP servers found');
    }
  }
}
