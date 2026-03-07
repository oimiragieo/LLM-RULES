/**
 * Agent Registry Generator
 *
 * Reads all agent definitions and generates capability cards.
 * Outputs: .claude/context/agent-registry.json
 *
 * Usage: npm run agents:registry
 *
 * @module agent-registry-generator
 * @see {@link file://.claude/schemas/agent-capability-card.schema.json} Schema
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const {
  getDefaultTools,
  DOMAIN_MAPPING,
  normalizeModelName,
} = require('./agent-registry-generator-config.cjs');
const {
  parseAgentFrontmatter,
  parseSimpleYaml,
  extractTriggerPhrases,
  extractExamplesAndTags,
  inferDomain,
} = require('./agent-registry-generator-frontmatter.cjs');
const {
  loadAgentSkillMatrixAndSkillIndex,
  getSkillEntryVariants,
  getRequiredToolsUnionForAgent,
  getAssignedSkillsForAgent,
  getAlwaysSkillsForAgent,
} = require('./agent-registry-generator-skills.cjs');

// Try to load optional dependencies
let yaml;
let Ajv;
let addFormats;

try {
  yaml = require('js-yaml');
} catch {
  // js-yaml is a devDependency
  yaml = null;
}

try {
  Ajv = require('ajv');
  addFormats = require('ajv-formats');
} catch {
  Ajv = null;
  addFormats = null;
}

/**
 * Generate capability card for a single agent
 * @param {Object} agentDef - Agent definition from frontmatter
 * @param {string} agentId - Agent ID (filename without .md)
 * @param {string} category - Agent category
 * @param {string} filePath - Full path to agent file
 * @param {string[]} [toolsUnionFromSkills] - Union of tools required by agent's skills (from matrix + skill-index)
 * @param {string[]} [assignedSkills] - Consolidated skills from frontmatter + matrix
 * @returns {Object} Capability card
 */
function generateCapabilityCard(
  agentDef,
  agentId,
  category,
  filePath,
  toolsUnionFromSkills = [],
  assignedSkills = null
) {
  const domain = inferDomain(agentDef, agentId, category);
  const triggerPhrases = extractTriggerPhrases(agentDef, agentId);

  // Get tools list from agent .md
  let tools = ['Read', 'Write', 'Edit', 'Bash'];
  if (agentDef.tools) {
    if (Array.isArray(agentDef.tools)) {
      tools = agentDef.tools;
    } else if (typeof agentDef.tools === 'string') {
      tools = agentDef.tools
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
    }
  }
  // Merge with union of tools required by this agent's skills so registry has full set
  // EXCEPTION: Router agent has strict tool restrictions (Section 0 of CLAUDE.md).
  // Router delegates skill execution to subagents, so skill tools must NOT be merged.
  const TOOL_RESTRICTED_AGENTS = new Set(['router']);
  if (toolsUnionFromSkills.length > 0 && !TOOL_RESTRICTED_AGENTS.has(agentId)) {
    const merged = new Set([...tools, ...toolsUnionFromSkills]);
    tools = [...merged];
  }

  // Get skills list
  const skills =
    Array.isArray(assignedSkills) && assignedSkills.length > 0
      ? assignedSkills
      : agentDef.skills && Array.isArray(agentDef.skills)
        ? agentDef.skills
        : [];
  const { examples, tags } = extractExamplesAndTags(agentDef, triggerPhrases, skills);

  // Build display name
  let displayName = agentDef.name;
  if (!displayName) {
    displayName = agentId
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Primary capability name (clean up agent ID)
  const capabilityName = agentId.replace(/-pro$/, '').replace(/-expert$/, '');

  // Truncate description to 200 chars for schema compliance
  let description = agentDef.description || `${displayName} capability`;
  if (description.length > 200) {
    description = description.slice(0, 197) + '...';
  }

  // Build capabilities from skills and description
  const capabilities = [
    {
      name: capabilityName,
      domain: domain,
      description: description,
      triggerPhrases: triggerPhrases.slice(0, 50),
      requiredTools: tools.slice(0, 50),
      skills: skills.slice(0, 50),
      examples: examples.slice(0, 50),
      tags: tags.slice(0, 50),
    },
  ];

  // Normalize file path to relative format
  let relativePath = filePath;
  if (path.isAbsolute(filePath)) {
    relativePath = path.relative(PROJECT_ROOT, filePath);
  }
  relativePath = relativePath.replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  // Normalize to expected format
  relativePath = relativePath.replace('./', '.claude/');
  if (!relativePath.startsWith('.claude/')) {
    relativePath = '.claude/' + relativePath.replace(/^\.\//, '');
  }

  return {
    id: agentId,
    displayName: displayName,
    category: category,
    filePath: relativePath,
    capabilities: capabilities,
    constraints: {
      maxConcurrentTasks: 5,
      preferredModel: normalizeModelName(agentDef.model),
    },
    health: {
      status: 'healthy',
      consecutiveFailures: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 1.0,
      lastUpdate: new Date().toISOString(),
      isolatedAt: null,
      isolationReason: null,
    },
    metadata: {
      version: agentDef.version || '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * AgentRegistryGenerator class
 */
class AgentRegistryGenerator {
  constructor() {
    this.agents = new Map();
    this.registry = {
      version: '1.0.0',
      generatedAt: null,
      metadata: {},
      agents: {},
      index: {
        byCapability: {},
        byDomain: {},
        byCategory: {},
      },
      health: {
        healthy: [],
        degraded: [],
        unavailable: [],
      },
    };
  }

  /**
   * Scan all agent directories
   * @param {string} agentsDir - Path to agents directory
   * @returns {Promise<Map>} Map of agent ID to agent info
   */
  async scanAgents(agentsDir) {
    const categories = ['core', 'specialized', 'domain', 'orchestrators', 'isolated'];
    const agents = new Map();

    for (const category of categories) {
      const categoryDir = path.join(agentsDir, category);

      if (!fs.existsSync(categoryDir)) continue;

      const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        // Skip README files
        if (file.toLowerCase() === 'readme.md') continue;

        const filePath = path.join(categoryDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const agentDef = parseAgentFrontmatter(content, { yaml });

        if (!agentDef) {
          // Skip files without valid frontmatter
          continue;
        }

        const agentId = file.replace('.md', '');

        agents.set(agentId, {
          definition: agentDef,
          category: category === 'orchestrators' ? 'orchestrator' : category,
          filePath: filePath,
        });
      }
    }

    return agents;
  }

  /**
   * Build indices for fast lookup
   */
  buildIndices() {
    for (const [agentId, card] of Object.entries(this.registry.agents)) {
      // Index by category
      if (!this.registry.index.byCategory[card.category]) {
        this.registry.index.byCategory[card.category] = [];
      }
      if (!this.registry.index.byCategory[card.category].includes(agentId)) {
        this.registry.index.byCategory[card.category].push(agentId);
      }

      // Index by capabilities
      for (const capability of card.capabilities) {
        if (!this.registry.index.byCapability[capability.name]) {
          this.registry.index.byCapability[capability.name] = [];
        }
        if (!this.registry.index.byCapability[capability.name].includes(agentId)) {
          this.registry.index.byCapability[capability.name].push(agentId);
        }

        // Index by domain
        if (!this.registry.index.byDomain[capability.domain]) {
          this.registry.index.byDomain[capability.domain] = [];
        }
        if (!this.registry.index.byDomain[capability.domain].includes(agentId)) {
          this.registry.index.byDomain[capability.domain].push(agentId);
        }
      }
    }
  }

  /**
   * Update health summary arrays
   */
  updateHealthSummary() {
    this.registry.health.healthy = [];
    this.registry.health.degraded = [];
    this.registry.health.unavailable = [];

    for (const [agentId, card] of Object.entries(this.registry.agents)) {
      switch (card.health.status) {
        case 'healthy':
          this.registry.health.healthy.push(agentId);
          break;
        case 'degraded':
          this.registry.health.degraded.push(agentId);
          break;
        case 'unavailable':
          this.registry.health.unavailable.push(agentId);
          break;
      }
    }
  }

  /**
   * Generate full registry
   * @param {string} agentsDir - Path to agents directory
   * @returns {Promise<Object>} Generated registry
   */
  async generate(agentsDir) {
    const agents = await this.scanAgents(agentsDir);
    const { matrix, skillIndex } = loadAgentSkillMatrixAndSkillIndex();

    for (const [agentId, agentInfo] of agents) {
      let toolsUnionFromSkills = getRequiredToolsUnionForAgent(agentId, matrix, skillIndex);
      if (!Array.isArray(toolsUnionFromSkills) || toolsUnionFromSkills.length === 0) {
        toolsUnionFromSkills = getDefaultTools(agentId);
      }
      const assignedSkills = getAssignedSkillsForAgent(
        agentId,
        matrix,
        skillIndex,
        agentInfo.definition.skills
      );
      const card = generateCapabilityCard(
        agentInfo.definition,
        agentId,
        agentInfo.category,
        agentInfo.filePath,
        toolsUnionFromSkills,
        assignedSkills
      );
      // Expose always-skills at top level for fast compliance checks (no skill-cap applied)
      card.alwaysSkills = getAlwaysSkillsForAgent(agentId, matrix);
      this.registry.agents[agentId] = card;
    }

    this.buildIndices();
    this.updateHealthSummary();

    this.registry.generatedAt = new Date().toISOString();
    this.registry.metadata = {
      totalAgents: Object.keys(this.registry.agents).length,
      healthyAgents: this.registry.health.healthy.length,
      degradedAgents: this.registry.health.degraded.length,
      unavailableAgents: this.registry.health.unavailable.length,
      lastHealthCheck: new Date().toISOString(),
      lastFullScan: new Date().toISOString(),
    };

    return this.registry;
  }

  /**
   * Validate registry against schema
   * @param {Object} registry - Registry to validate
   * @returns {Object} Validation result
   */
  validate(registry) {
    const schemaPath = path.join(PROJECT_ROOT, '.claude/schemas/agent-capability-card.schema.json');

    if (!fs.existsSync(schemaPath)) {
      return { valid: true, errors: [], message: 'Schema file not found, skipping validation' };
    }

    if (!Ajv || !addFormats) {
      return { valid: true, errors: [], message: 'AJV not available, skipping validation' };
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    const validate = ajv.compile(schema);
    const errors = [];

    for (const [agentId, card] of Object.entries(registry.agents)) {
      if (!validate(card)) {
        errors.push({
          agentId,
          errors: validate.errors,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Save registry to file
   * @param {Object} registry - Registry to save
   * @param {string} outputPath - Output file path
   */
  saveRegistry(registry, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2));
    console.log(`Registry saved to ${outputPath}`);
  }
}

/**
 * CLI entry point
 */
async function main() {
  const generator = new AgentRegistryGenerator();
  const agentsDir = path.join(PROJECT_ROOT, '.claude/agents');
  const outputPath = path.join(PROJECT_ROOT, '.claude/context/agent-registry.json');

  console.log('Scanning agents...');
  const registry = await generator.generate(agentsDir);

  console.log(`Found ${registry.metadata.totalAgents} agents`);

  const validation = generator.validate(registry);
  if (!validation.valid) {
    console.error('Validation errors:', JSON.stringify(validation.errors, null, 2));
    process.exit(1);
  }

  generator.saveRegistry(registry, outputPath);
  console.log('Registry generation complete');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  AgentRegistryGenerator,
  generateCapabilityCard,
  parseAgentFrontmatter,
  parseSimpleYaml,
  normalizeModelName,
  inferDomain,
  extractTriggerPhrases,
  extractExamplesAndTags,
  getRequiredToolsUnionForAgent,
  getAssignedSkillsForAgent,
  getSkillEntryVariants,
  DOMAIN_MAPPING,
};
