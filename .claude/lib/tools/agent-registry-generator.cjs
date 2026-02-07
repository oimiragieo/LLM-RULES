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
const { getDefaultTools } = require('../agents/agent-config.cjs');

const AGENT_SKILL_MATRIX_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'config',
  'agent-skill-matrix.json'
);
const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');

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
 * Domain mapping from skills/keywords to capability domains
 */
const DOMAIN_MAPPING = {
  // Code domains
  tdd: 'code',
  debugging: 'code',
  implementation: 'code',
  refactoring: 'code',
  'code-review': 'code',
  'code-reviewer': 'code',
  'code-simplifier': 'code',
  'code-quality': 'code',
  'code-analyzer': 'code',

  // Testing
  'qa-workflow': 'testing',
  testing: 'testing',
  test: 'testing',
  qa: 'testing',

  // Security
  'security-architect': 'security',
  security: 'security',
  owasp: 'security',
  'threat-modeling': 'security',
  auth: 'security',
  'auth-security': 'security',

  // DevOps
  devops: 'devops',
  infrastructure: 'devops',
  'ci-cd': 'devops',
  deployment: 'devops',
  docker: 'devops',
  kubernetes: 'devops',
  incident: 'devops',

  // Research
  research: 'research',
  'fact-finding': 'research',
  researcher: 'research',
  scientific: 'research',

  // Documentation
  documentation: 'documentation',
  'technical-writing': 'documentation',
  'technical-writer': 'documentation',
  docs: 'documentation',

  // Architecture
  architecture: 'architecture',
  'system-design': 'architecture',
  c4: 'architecture',
  architect: 'architecture',

  // Database
  database: 'database',
  schema: 'database',
  sql: 'database',
  'data-engineer': 'database',

  // Frontend
  react: 'frontend',
  vue: 'frontend',
  angular: 'frontend',
  frontend: 'frontend',
  nextjs: 'frontend',
  svelte: 'frontend',
  sveltekit: 'frontend',

  // Backend
  nodejs: 'backend',
  express: 'backend',
  fastapi: 'backend',
  django: 'backend',
  spring: 'backend',
  laravel: 'backend',
  php: 'backend',
  java: 'backend',
  python: 'backend',
  golang: 'backend',
  rust: 'backend',
  go: 'backend',

  // Mobile
  ios: 'mobile',
  android: 'mobile',
  'react-native': 'mobile',
  expo: 'mobile',
  mobile: 'mobile',
  tauri: 'mobile',

  // AI/ML
  ai: 'ai-ml',
  ml: 'ai-ml',
  'machine-learning': 'ai-ml',
  'deep-learning': 'ai-ml',
  'ai-ml': 'ai-ml',

  // Blockchain
  web3: 'blockchain',
  blockchain: 'blockchain',
  defi: 'blockchain',
  'smart-contracts': 'blockchain',

  // Orchestration
  orchestration: 'orchestration',
  swarm: 'orchestration',
  'multi-agent': 'orchestration',
  orchestrator: 'orchestration',
  coordinator: 'orchestration',

  // Planning
  planning: 'planning',
  planner: 'planning',
  roadmap: 'planning',
  'project-management': 'planning',
  pm: 'planning',
};

/**
 * Normalize model name to short form (haiku, sonnet, opus)
 * @param {string} model - Model name (may be full or short form)
 * @returns {string} Normalized short form
 */
function normalizeModelName(model) {
  if (!model) return 'sonnet';

  const modelLower = model.toLowerCase();

  if (modelLower.includes('haiku')) return 'haiku';
  if (modelLower.includes('sonnet')) return 'sonnet';
  if (modelLower.includes('opus')) return 'opus';

  // Return original if it's already a valid short form
  if (['haiku', 'sonnet', 'opus'].includes(modelLower)) {
    return modelLower;
  }

  // Default fallback
  return 'sonnet';
}

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Markdown file content
 * @returns {Object|null} Parsed frontmatter or null
 */
function parseAgentFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;

  try {
    if (yaml) {
      // SEC-LIB-003 FIX: Use safe YAML schema to prevent deserialization attacks
      return yaml.load(frontmatterMatch[1], { schema: yaml.CORE_SCHEMA });
    }
    // Fallback: simple YAML parsing for key: value pairs
    return parseSimpleYaml(frontmatterMatch[1]);
  } catch (_error) {
    // If the YAML parser rejects the frontmatter, fall back to the simple parser.
    // This keeps registry generation resilient to slightly-nonstandard YAML.
    try {
      const parsed = parseSimpleYaml(frontmatterMatch[1]);
      if (!parsed || !parsed.name || !parsed.description) return null;
      return parsed;
    } catch (_fallbackError) {
      // Don't throw, just return null for invalid frontmatter
      return null;
    }
  }
}

/**
 * Simple YAML parser for when js-yaml is not available
 * Handles basic key: value, arrays, and nested objects
 * @param {string} yamlContent - YAML string
 * @returns {Object} Parsed object
 */
function parseSimpleYaml(yamlContent) {
  const result = {};
  const lines = yamlContent.split('\n');
  let currentKey = null;
  let inArray = false;
  let arrayValues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array context (supports both dash arrays and flow arrays split across lines)
    if (inArray && currentKey) {
      // Flow array delimiters
      if (trimmed === '[') continue;
      if (trimmed === ']') {
        result[currentKey] = arrayValues;
        arrayValues = [];
        inArray = false;
        currentKey = null;
        continue;
      }

      // Dash array item
      if (trimmed.startsWith('- ')) {
        const raw = trimmed.slice(2).trim();
        const withoutComment = raw.replace(/\s+#.*$/, '').trim();
        if (withoutComment) arrayValues.push(parseYamlValue(withoutComment));
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex <= 0) {
        // Flow array item (e.g. "Read," or "'some string',")
        const raw = trimmed.replace(/,\s*$/, '').trim();
        const withoutComment = raw.replace(/\s+#.*$/, '').trim();
        if (!withoutComment) continue;

        // Allow a one-line inline array inside an array context:
        // tools:
        //   [Read, Write]
        if (withoutComment.startsWith('[') && withoutComment.endsWith(']')) {
          const arrayContent = withoutComment.slice(1, -1);
          arrayContent
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(v => arrayValues.push(parseYamlValue(v)));
          continue;
        }

        arrayValues.push(parseYamlValue(withoutComment));
        continue;
      }

      // New key encountered: finish previous array and continue parsing the key line below
      result[currentKey] = arrayValues;
      arrayValues = [];
      inArray = false;
      currentKey = null;
    }

    // Key: value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      // Handle inline array [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        result[key] = arrayContent
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        inArray = false;
        currentKey = null;
        continue;
      }

      if (value === '' || value === '[') {
        // Start of array or nested object
        currentKey = key;
        inArray = true;
        arrayValues = [];
      } else {
        // Simple value
        result[key] = parseYamlValue(value);
        currentKey = null;
      }
    }
  }

  // Handle trailing array
  if (inArray && currentKey) {
    result[currentKey] = arrayValues;
  }

  return result;
}

/**
 * Parse a YAML value (handle booleans, numbers, strings)
 * @param {string} value - Raw value string
 * @returns {*} Parsed value
 */
function parseYamlValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Extract trigger phrases from agent description and name
 * @param {Object} agentDef - Agent definition object
 * @param {string} agentId - Agent ID
 * @returns {string[]} Trigger phrases
 */
function extractTriggerPhrases(agentDef, agentId) {
  const phrases = [];

  // From agent name (split by hyphens, filter short parts)
  const namePhrases = agentId.split('-').filter(p => p.length > 2);
  phrases.push(...namePhrases);

  // From description
  if (agentDef.description) {
    // Extract key action words
    const actionWords =
      agentDef.description.match(
        /\b(implement|review|test|debug|design|analyze|fix|build|create|deploy|optimize|refactor|validate|audit|plan|coordinate|orchestrate)\w*/gi
      ) || [];
    phrases.push(...actionWords.map(w => w.toLowerCase()));
  }

  // From skills
  if (agentDef.skills && Array.isArray(agentDef.skills)) {
    phrases.push(...agentDef.skills.filter(s => s.length > 2));
  }

  // Dedupe and return
  return [...new Set(phrases)];
}

function extractExamplesAndTags(agentDef, triggerPhrases, skills) {
  const examples = Array.isArray(agentDef.examples)
    ? agentDef.examples
    : Array.isArray(agentDef.capability_examples)
      ? agentDef.capability_examples
      : [];
  const tagsFromFrontmatter = Array.isArray(agentDef.tags) ? agentDef.tags : [];
  const tagsFromPhrases = (triggerPhrases || [])
    .flatMap(phrase => phrase.toLowerCase().split(/\s+/))
    .filter(word => word.length > 2);
  const tags = [...new Set([...tagsFromFrontmatter, ...tagsFromPhrases, ...(skills || [])])];
  return { examples, tags };
}

/**
 * Infer domain from agent definition
 * @param {Object} agentDef - Agent definition
 * @param {string} agentId - Agent ID
 * @param {string} category - Agent category
 * @returns {string} Domain name
 */
function inferDomain(agentDef, agentId, category) {
  // Check skills first
  if (agentDef.skills && Array.isArray(agentDef.skills)) {
    for (const skill of agentDef.skills) {
      const skillLower = skill.toLowerCase();
      const domain = DOMAIN_MAPPING[skillLower];
      if (domain) return domain;
    }
  }

  // Check agent ID keywords
  const idLower = agentId.toLowerCase();
  for (const [keyword, domain] of Object.entries(DOMAIN_MAPPING)) {
    if (idLower.includes(keyword)) return domain;
  }

  // Fallback by category
  const categoryDomains = {
    core: 'code',
    specialized: 'code',
    domain: 'code',
    orchestrator: 'orchestration',
  };

  return categoryDomains[category] || 'code';
}

/**
 * Load agent-skill-matrix and skill-index for tool union computation
 * @returns {{ matrix: Object, skillIndex: Object }}
 */
function loadAgentSkillMatrixAndSkillIndex() {
  let matrix = { agents: {} };
  let skillIndex = { skills: {} };
  try {
    if (fs.existsSync(AGENT_SKILL_MATRIX_PATH)) {
      matrix = JSON.parse(fs.readFileSync(AGENT_SKILL_MATRIX_PATH, 'utf8'));
    }
  } catch (_error) {
    // ignore
  }
  try {
    if (fs.existsSync(SKILL_INDEX_PATH)) {
      skillIndex = JSON.parse(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
    }
  } catch (_error) {
    // ignore
  }
  return { matrix, skillIndex };
}

/**
 * Get union of requiredTools for all skills assigned to this agent in agent-skill-matrix
 * @param {string} agentId - Agent ID
 * @param {Object} matrix - agent-skill-matrix.json content
 * @param {Object} skillIndex - skill-index.json content
 * @returns {string[]} Tool names
 */
function getRequiredToolsUnionForAgent(agentId, matrix, skillIndex) {
  const skills = new Set();
  const agents = matrix.agents || {};
  for (const categoryAgents of Object.values(agents)) {
    if (typeof categoryAgents !== 'object') continue;
    const config = categoryAgents[agentId];
    if (!config) continue;
    const primary = Array.isArray(config.primary) ? config.primary : [];
    const secondary = Array.isArray(config.secondary) ? config.secondary : [];
    const always = Array.isArray(config.always) ? config.always : [];
    const contextual =
      config.contextual && typeof config.contextual === 'object'
        ? Object.values(config.contextual).flat()
        : [];
    [...primary, ...secondary, ...always, ...contextual].forEach(s => skills.add(s));
  }
  const tools = new Set();
  const indexSkills = skillIndex.skills || {};
  for (const skillName of skills) {
    const skill = indexSkills[skillName];
    if (skill && Array.isArray(skill.requiredTools)) {
      skill.requiredTools.forEach(t => tools.add(t));
    }
  }
  return [...tools];
}

/**
 * Generate capability card for a single agent
 * @param {Object} agentDef - Agent definition from frontmatter
 * @param {string} agentId - Agent ID (filename without .md)
 * @param {string} category - Agent category
 * @param {string} filePath - Full path to agent file
 * @param {string[]} [toolsUnionFromSkills] - Union of tools required by agent's skills (from matrix + skill-index)
 * @returns {Object} Capability card
 */
function generateCapabilityCard(agentDef, agentId, category, filePath, toolsUnionFromSkills = []) {
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
  if (toolsUnionFromSkills.length > 0) {
    const merged = new Set([...tools, ...toolsUnionFromSkills]);
    tools = [...merged];
  }

  // Get skills list
  const skills = agentDef.skills && Array.isArray(agentDef.skills) ? agentDef.skills : [];
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
      triggerPhrases: triggerPhrases.slice(0, 10),
      requiredTools: tools.slice(0, 18),
      skills: skills.slice(0, 10),
      examples: examples.slice(0, 10),
      tags: tags.slice(0, 15),
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
    const categories = ['core', 'specialized', 'domain', 'orchestrators'];
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
        const agentDef = parseAgentFrontmatter(content);

        if (!agentDef) {
          // Skip files without valid frontmatter
          continue;
        }

        const agentId = file.replace('.md', '');
        // Normalize category (orchestrators -> orchestrator)
        const normalizedCategory = category === 'orchestrators' ? 'orchestrator' : category;

        agents.set(agentId, {
          definition: agentDef,
          category: normalizedCategory,
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
      const card = generateCapabilityCard(
        agentInfo.definition,
        agentId,
        agentInfo.category,
        agentInfo.filePath,
        toolsUnionFromSkills
      );
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
  DOMAIN_MAPPING,
};
