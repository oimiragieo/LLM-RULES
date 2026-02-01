#!/usr/bin/env node
/**
 * Tool Manifest Generator
 * ========================
 *
 * Generates .claude/config/tool-manifest.json from CLAUDE.md sections 1.1-1.4
 *
 * Usage:
 *   node .claude/tools/cli/generate-tool-manifest.cjs [options]
 *
 * Options:
 *   --dry-run   Show what would be generated without writing
 *   --validate  Only validate existing manifest
 *   --verbose   Show detailed output
 *
 * Output:
 *   .claude/config/tool-manifest.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Project root detection
const PROJECT_ROOT = process.cwd();
const CONFIG_DIR = path.join(PROJECT_ROOT, '.claude', 'config');
const MANIFEST_PATH = path.join(CONFIG_DIR, 'tool-manifest.json');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const SKILL_INDEX_PATH = path.join(CONFIG_DIR, 'skill-index.json');
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const TOOL_MANIFEST_SCHEMA_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'schemas',
  'tool-manifest.schema.json'
);

// Core tools definition (from CLAUDE.md Section 1.4)
const CORE_TOOLS = [
  {
    name: 'Read',
    category: 'File I/O',
    description: 'Read files from filesystem',
    mandatory: false,
  },
  { name: 'Write', category: 'File I/O', description: 'Create/overwrite files', mandatory: false },
  {
    name: 'Edit',
    category: 'File I/O',
    description: 'Make precise edits to files',
    mandatory: false,
  },
  { name: 'Bash', category: 'Shell', description: 'Execute shell commands', mandatory: false },
  {
    name: 'Glob',
    category: 'Search',
    description: 'Pattern-based file discovery',
    mandatory: false,
  },
  { name: 'Grep', category: 'Search', description: 'Content search in files', mandatory: false },
  { name: 'Task', category: 'Orchestration', description: 'Spawn subagents', mandatory: false },
  {
    name: 'Orchestrator',
    category: 'Orchestration',
    description: 'Delegate task to agent pipeline',
    mandatory: false,
  },
  {
    name: 'TaskCreate',
    category: 'Task Management',
    description: 'Create trackable tasks',
    mandatory: false,
  },
  {
    name: 'TaskUpdate',
    category: 'Task Management',
    description: 'Update task status/metadata',
    mandatory: true,
  },
  {
    name: 'TaskList',
    category: 'Task Management',
    description: 'List all tasks',
    mandatory: false,
  },
  {
    name: 'TaskGet',
    category: 'Task Management',
    description: 'Get task details',
    mandatory: false,
  },
  {
    name: 'TaskOutput',
    category: 'Task Management',
    description: 'Read task output',
    mandatory: false,
  },
  {
    name: 'TaskStop',
    category: 'Task Management',
    description: 'Stop running task',
    mandatory: false,
  },
  { name: 'Skill', category: 'Capability', description: 'Invoke skill workflows', mandatory: true },
  {
    name: 'AskUserQuestion',
    category: 'Interaction',
    description: 'Get user input',
    mandatory: false,
  },
  {
    name: 'EnterPlanMode',
    category: 'Planning',
    description: 'Switch to planning mode',
    mandatory: false,
  },
  {
    name: 'ExitPlanMode',
    category: 'Planning',
    description: 'Exit planning mode',
    mandatory: false,
  },
  { name: 'WebSearch', category: 'Research', description: 'Search the web', mandatory: false },
  {
    name: 'WebFetch',
    category: 'Research',
    description: 'Fetch webpage content',
    mandatory: false,
  },
  {
    name: 'NotebookEdit',
    category: 'Jupyter',
    description: 'Edit notebook cells',
    mandatory: false,
  },
];

// MCP tools definition (from CLAUDE.md Section 1.4)
const MCP_TOOLS = [
  {
    name: 'mcp__chrome-devtools__*',
    server: 'chrome-devtools',
    description: 'Browser automation via Chrome DevTools Protocol',
    fallback: "Skill({ skill: 'chrome-browser' })",
    fallbackTools: ['Read', 'Write', 'WebFetch'],
  },
  {
    name: 'mcp__sequential-thinking__sequentialthinking',
    server: 'sequential-thinking',
    description: 'Structured thinking and analysis',
    fallback: "Skill({ skill: 'sequential-thinking' })",
    fallbackTools: ['Read', 'Write', 'Bash'],
  },
  {
    name: 'mcp__Ref__ref_search_documentation',
    server: 'Ref',
    description: 'Documentation search',
    fallback: 'WebSearch + WebFetch',
    fallbackTools: ['WebSearch', 'WebFetch'],
  },
  {
    name: 'mcp__Ref__ref_read_url',
    server: 'Ref',
    description: 'Read URL content via Ref',
    fallback: 'WebFetch',
    fallbackTools: ['WebFetch'],
  },
  {
    name: 'mcp__Exa__web_search_exa',
    server: 'Exa',
    description: 'Enhanced web search via Exa',
    fallback: 'WebSearch',
    fallbackTools: ['WebSearch'],
  },
  {
    name: 'mcp__Exa__get_code_context_exa',
    server: 'Exa',
    description: 'Code context search via Exa',
    fallback: 'Grep + Glob',
    fallbackTools: ['Grep', 'Glob'],
  },
  {
    name: 'mcp__Exa__company_research_exa',
    server: 'Exa',
    description: 'Company research via Exa',
    fallback: 'WebSearch',
    fallbackTools: ['WebSearch'],
  },
  {
    name: 'mcp__shadcn__getComponents',
    server: 'shadcn',
    description: 'Get shadcn/ui components list',
    fallback: "WebFetch('https://ui.shadcn.com/...')",
    fallbackTools: ['WebFetch'],
  },
  {
    name: 'mcp__shadcn__getComponent',
    server: 'shadcn',
    description: 'Get specific shadcn/ui component',
    fallback: "WebFetch('https://ui.shadcn.com/...')",
    fallbackTools: ['WebFetch'],
  },
];

// Toolset definitions (from CLAUDE.md Section 1.4)
// NOTE: `tools.toolsets` in the manifest must map toolset names to arrays of tool names
// (see `.claude/schemas/tool-manifest.schema.json`). Keep richer metadata here and
// derive the schema-shape mapping below.
const TOOLSET_DEFINITIONS = {
  CORE_TOOLS: {
    description: 'All 20 core tools built into Claude Code',
    tools: CORE_TOOLS.map(t => t.name),
  },
  DEVELOPER: {
    description: 'Standard development agent toolset',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  PLANNER: {
    description: 'Planning agent toolset with planning mode',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
      'EnterPlanMode',
      'ExitPlanMode',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  ORCHESTRATOR: {
    description: 'Agent orchestration toolset (can spawn subagents)',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'Task',
      'Orchestrator',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'TaskOutput',
      'Skill',
    ],
    mandatory: ['Task', 'TaskUpdate', 'Skill'],
  },
  ROUTER: {
    description: 'Router-only toolset (restricted)',
    tools: ['Read', 'Task', 'TaskList', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'AskUserQuestion'],
    mandatory: ['Task', 'TaskList'],
  },
  RESEARCHER: {
    description: 'Research agent toolset with web access',
    tools: [
      'Read',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'Skill',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  READ_ONLY: {
    description: 'Read-only agent toolset (e.g., code-reviewer)',
    tools: ['Read', 'Glob', 'Grep', 'TaskUpdate', 'TaskList', 'Skill'],
    mandatory: ['TaskUpdate', 'Skill'],
  },
  DATA_SCIENCE: {
    description: 'Data science and ML toolset with Jupyter support',
    tools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'NotebookEdit',
      'TaskUpdate',
      'TaskList',
      'TaskCreate',
      'TaskGet',
      'Skill',
    ],
    mandatory: ['TaskUpdate', 'Skill'],
  },
};

const TOOLSETS = Object.fromEntries(
  Object.entries(TOOLSET_DEFINITIONS).map(([name, def]) => [name, def.tools])
);

// Agent defaults (from CLAUDE.md Section 1.4)
const AGENT_DEFAULTS = {
  developer: { toolset: 'DEVELOPER', maxTools: 12 },
  qa: { toolset: 'DEVELOPER', maxTools: 12 },
  planner: { toolset: 'PLANNER', maxTools: 14 },
  architect: { toolset: 'PLANNER', maxTools: 14 },
  'security-architect': { toolset: 'DEVELOPER', maxTools: 12 },
  'technical-writer': { toolset: 'DEVELOPER', maxTools: 12 },
  devops: { toolset: 'DEVELOPER', maxTools: 12 },
  'code-reviewer': { toolset: 'READ_ONLY', maxTools: 6 },
  researcher: { toolset: 'RESEARCHER', maxTools: 10 },
  'master-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'swarm-coordinator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'evolution-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'party-orchestrator': { toolset: 'ORCHESTRATOR', maxTools: 13 },
  'context-compressor': { toolset: 'DEVELOPER', maxTools: 5 },
  'data-engineer': { toolset: 'DATA_SCIENCE', maxTools: 12 },
  'ai-ml-specialist': { toolset: 'DATA_SCIENCE', maxTools: 12 },
};

/**
 * Check MCP server configuration
 */
function checkMCPServers() {
  const configuredServers = {};

  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      const mcpServers = settings.mcpServers || {};

      for (const server of Object.keys(mcpServers)) {
        configuredServers[server] = true;
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not read settings.json: ${err.message}`);
  }

  return configuredServers;
}

/**
 * Generate the tool manifest
 */
function generateManifest(options = {}) {
  const { verbose = false } = options;
  const configuredServers = checkMCPServers();

  // Build core tools array
  const coreToolsArray = CORE_TOOLS.map(tool => ({
    name: tool.name,
    category: tool.category,
    description: tool.description,
    status: 'available',
    mandatory: tool.mandatory,
    availability: {
      agents: tool.name === 'AskUserQuestion' ? 'no' : tool.name === 'Task' ? 'no' : 'all',
      orchestrators: tool.name === 'AskUserQuestion' ? 'no' : 'all',
      router: [
        'Read',
        'Task',
        'TaskList',
        'TaskCreate',
        'TaskUpdate',
        'TaskGet',
        'AskUserQuestion',
      ].includes(tool.name)
        ? 'yes'
        : 'no',
    },
  }));

  // Build MCP tools array
  const mcpToolsArray = MCP_TOOLS.map(tool => {
    const isConfigured = configuredServers[tool.server] || false;
    return {
      name: tool.name,
      category: `MCP - ${tool.server}`,
      description: tool.description,
      status: isConfigured ? 'available' : 'unavailable',
      reason: isConfigured ? null : `MCP server '${tool.server}' not configured`,
      mcp_server: tool.server,
      fallback: tool.fallback,
      fallback_status: 'available',
      fallback_tools: tool.fallbackTools,
    };
  });

  // Build agent defaults with tools
  const agentDefaults = {};
  for (const [agent, config] of Object.entries(AGENT_DEFAULTS)) {
    const toolset = TOOLSET_DEFINITIONS[config.toolset];
    agentDefaults[agent] = {
      toolset: config.toolset,
      tools: toolset.tools,
      maxTools: config.maxTools,
    };
  }

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalTools: CORE_TOOLS.length + MCP_TOOLS.length,
      totalCoreTools: CORE_TOOLS.length,
      totalMcpTools: MCP_TOOLS.length,
      totalAgents: Object.keys(agentDefaults).length,
      lastValidated: new Date().toISOString(),
      source: '.claude/CLAUDE.md sections 1.1-1.4',
    },
    tools: {
      core: coreToolsArray,
      mcp: mcpToolsArray,
      toolsets: TOOLSETS,
    },
    constraints: {
      maxToolsPerAgent: 15,
      maxToolsPerOrchestrator: 18,
      toolCounts: {
        coreTools: CORE_TOOLS.length,
        mcpTools: MCP_TOOLS.length,
        totalAvailable: CORE_TOOLS.length,
        totalUnavailable: mcpToolsArray.filter(t => t.status === 'unavailable').length,
      },
    },
    validation: {
      agentDefaults,
      reservedTools: {
        Task: [
          'router',
          'master-orchestrator',
          'evolution-orchestrator',
          'swarm-coordinator',
          'party-orchestrator',
        ],
        AskUserQuestion: ['router'],
      },
      mandatoryTools: ['TaskUpdate', 'Skill'],
      blockOnMissingMandatory: true,
      warnOnMCPWithoutServer: true,
      blockOnUnknownTool: true,
    },
  };

  if (verbose) {
    console.log(`Generated manifest with:`);
    console.log(`  - ${CORE_TOOLS.length} core tools`);
    console.log(`  - ${MCP_TOOLS.length} MCP tools`);
    console.log(`  - ${Object.keys(TOOLSETS).length} toolsets`);
    console.log(`  - ${Object.keys(agentDefaults).length} agent defaults`);
    console.log(
      `  - ${mcpToolsArray.filter(t => t.status === 'available').length} MCP tools available`
    );
    console.log(
      `  - ${mcpToolsArray.filter(t => t.status === 'unavailable').length} MCP tools unavailable`
    );
  }

  return manifest;
}

/**
 * Collect all tool names referenced in skill-index and agent-registry requiredTools
 * @returns {Set<string>}
 */
function collectReferencedTools() {
  const tools = new Set();
  try {
    if (fs.existsSync(SKILL_INDEX_PATH)) {
      const skillIndex = JSON.parse(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
      const skills = skillIndex.skills || {};
      for (const skill of Object.values(skills)) {
        if (skill && Array.isArray(skill.requiredTools)) {
          skill.requiredTools.forEach(t => tools.add(t));
        }
      }
    }
  } catch (_error) {
    // ignore
  }
  try {
    if (fs.existsSync(AGENT_REGISTRY_PATH)) {
      const registry = JSON.parse(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
      const agents = registry.agents || {};
      for (const agent of Object.values(agents)) {
        const caps = agent.capabilities || [];
        for (const cap of caps) {
          if (cap && Array.isArray(cap.requiredTools)) {
            cap.requiredTools.forEach(t => tools.add(t));
          }
        }
      }
    }
  } catch (_error) {
    // ignore
  }
  return tools;
}

/**
 * Check if a tool name is in manifest (core by exact name, mcp by exact or wildcard prefix match)
 */
function toolInManifest(toolName, manifest) {
  const core = (manifest.tools?.core || []).map(t => t.name);
  if (core.includes(toolName)) return true;
  const mcp = (manifest.tools?.mcp || []).map(t => t.name);
  if (mcp.includes(toolName)) return true;
  // MCP wildcard: mcp__Exa__* matches mcp__Exa__web_search_exa
  if (mcp.some(m => m.endsWith('*') && toolName.startsWith(m.replace(/\*$/, '')))) return true;
  return false;
}

/**
 * Validate existing manifest
 */
function validateManifest(manifestPath) {
  const errors = [];
  const warnings = [];

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Check version
    if (!manifest.version) {
      errors.push('Missing version field');
    }

    // Check core tools count
    const coreTools = manifest.tools?.core || [];
    if (coreTools.length !== 20) {
      warnings.push(`Expected 20 core tools, found ${coreTools.length}`);
    }

    // Check MCP tools count
    const mcpTools = manifest.tools?.mcp || [];
    if (mcpTools.length !== 9) {
      warnings.push(`Expected 9 MCP tools, found ${mcpTools.length}`);
    }

    // Check mandatory tools have fallbacks
    for (const mcpTool of mcpTools) {
      if (mcpTool.status === 'unavailable' && !mcpTool.fallback) {
        errors.push(`MCP tool ${mcpTool.name} is unavailable but has no fallback`);
      }
    }

    // Check toolsets
    const toolsets = manifest.tools?.toolsets || {};
    if (Object.keys(toolsets).length < 5) {
      warnings.push(`Expected at least 5 toolsets, found ${Object.keys(toolsets).length}`);
    }

    // Audit: every tool referenced in skill-index or agent-registry must be in manifest
    const referenced = collectReferencedTools();
    const missing = [];
    for (const t of referenced) {
      if (!toolInManifest(t, manifest)) {
        missing.push(t);
      }
    }
    if (missing.length > 0) {
      warnings.push(
        `Tools referenced in skill-index or agent-registry but not in manifest: ${missing.join(', ')}`
      );
    }

    // Optional: validate against JSON schema when schema and Ajv exist
    if (fs.existsSync(TOOL_MANIFEST_SCHEMA_PATH)) {
      try {
        const Ajv = require('ajv');
        const addFormats = require('ajv-formats');
        const schema = JSON.parse(fs.readFileSync(TOOL_MANIFEST_SCHEMA_PATH, 'utf8'));
        const ajv = new Ajv({ strict: false });
        addFormats(ajv);
        const validate = ajv.compile(schema);
        if (!validate(manifest)) {
          (validate.errors || []).forEach(e => {
            errors.push(`Schema: ${e.instancePath || '/'} ${e.message}`);
          });
        }
      } catch (_error) {
        // Ajv or schema missing - skip schema validation
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (err) {
    return { valid: false, errors: [`Failed to parse manifest: ${err.message}`], warnings };
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate');
  const verbose = args.includes('--verbose');

  console.log('Tool Manifest Generator');
  console.log('=======================\n');

  if (validateOnly) {
    console.log('Validating existing manifest...\n');

    if (!fs.existsSync(MANIFEST_PATH)) {
      console.error(`Error: Manifest not found at ${MANIFEST_PATH}`);
      process.exit(1);
    }

    const result = validateManifest(MANIFEST_PATH);

    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (result.valid) {
      console.log('\nManifest is valid!');
      process.exit(0);
    } else {
      console.log('\nManifest validation failed.');
      process.exit(1);
    }
  }

  // Generate manifest
  const manifest = generateManifest({ verbose });

  if (dryRun) {
    console.log('Dry run - manifest would be written to:');
    console.log(`  ${MANIFEST_PATH}\n`);
    console.log('Preview:');
    console.log(JSON.stringify(manifest, null, 2).slice(0, 2000) + '...\n');
    console.log(`Total size: ${JSON.stringify(manifest).length} bytes`);
    return;
  }

  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(`Manifest generated successfully!`);
  console.log(`Output: ${MANIFEST_PATH}`);
  console.log(`\nStatistics:`);
  console.log(`  - Core tools: ${manifest.metadata.totalCoreTools}`);
  console.log(`  - MCP tools: ${manifest.metadata.totalMcpTools}`);
  console.log(`  - Toolsets: ${Object.keys(manifest.tools.toolsets).length}`);
  console.log(`  - Agent defaults: ${Object.keys(manifest.validation.agentDefaults).length}`);

  // Validate generated manifest
  const validation = validateManifest(MANIFEST_PATH);
  if (!validation.valid) {
    console.log('\nWarning: Generated manifest has validation issues:');
    validation.errors.forEach(e => console.log(`  - ${e}`));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateManifest, validateManifest, CORE_TOOLS, MCP_TOOLS, TOOLSETS };
