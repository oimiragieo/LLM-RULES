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

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
let prettierFormat = null;
let prettierResolveConfig = null;
let prettierLoadAttempted = false;

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
const {
  CORE_TOOLS,
  EDITING_TOOLS,
  OPTIONAL_TOOLS,
  NO_PROJECT_TOOLS,
  MCP_TOOLS,
  TOOLSET_DEFINITIONS,
  TOOLSETS,
  AGENT_DEFAULTS,
} = require('./tool-manifest-definitions.cjs');

function checkMCPServers() {
  const configuredServers = {};

  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const settings = safeParseJSON(fs.readFileSync(SETTINGS_PATH, 'utf8'));
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
    canEdit: tool.canEdit ?? EDITING_TOOLS.has(tool.name),
    optional: tool.optional ?? OPTIONAL_TOOLS.has(tool.name),
    requiresActiveProject: tool.requiresActiveProject ?? !NO_PROJECT_TOOLS.has(tool.name),
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
      canEdit: false,
      optional: false,
      requiresActiveProject: false,
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

  // Count total agents from agent-registry.json
  let totalAgents = Object.keys(agentDefaults).length; // fallback
  if (fs.existsSync(AGENT_REGISTRY_PATH)) {
    const registry = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
    totalAgents = Object.keys(registry.agents || {}).length;
  }

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalTools: CORE_TOOLS.length + MCP_TOOLS.length,
      totalCoreTools: CORE_TOOLS.length,
      totalMcpTools: MCP_TOOLS.length,
      totalAgents: totalAgents,
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
      const skillIndex = safeParseJSON(fs.readFileSync(SKILL_INDEX_PATH, 'utf8'));
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
      const registry = safeParseJSON(fs.readFileSync(AGENT_REGISTRY_PATH, 'utf8'));
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
    const manifest = safeParseJSON(fs.readFileSync(manifestPath, 'utf8'));

    // Check version
    if (!manifest.version) {
      errors.push('Missing version field');
    }

    // Check core tools count
    const coreTools = manifest.tools?.core || [];
    if (coreTools.length !== CORE_TOOLS.length) {
      warnings.push(`Expected ${CORE_TOOLS.length} core tools, found ${coreTools.length}`);
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
        const schema = safeParseJSON(fs.readFileSync(TOOL_MANIFEST_SCHEMA_PATH, 'utf8'));
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

async function getPrettierFormat() {
  if (typeof prettierFormat === 'function') {
    return prettierFormat;
  }
  if (prettierLoadAttempted) {
    throw new Error('Prettier formatter was not available');
  }
  prettierLoadAttempted = true;
  try {
    // Prettier v3 is ESM-only; use dynamic import from CJS.
    const mod = await import('prettier');
    prettierFormat = typeof mod?.format === 'function' ? mod.format : null;
    prettierResolveConfig = typeof mod?.resolveConfig === 'function' ? mod.resolveConfig : null;
    if (!prettierFormat) {
      throw new Error('Prettier module loaded, but no format() function was exported');
    }
    return prettierFormat;
  } catch (error) {
    throw new Error(`Failed to load Prettier for manifest formatting: ${error.message}`);
  }
}

/**
 * Main function
 */
async function formatManifestJson(manifest) {
  const raw = JSON.stringify(manifest, null, 2);
  const format = await getPrettierFormat();
  try {
    const resolved =
      typeof prettierResolveConfig === 'function'
        ? await prettierResolveConfig(MANIFEST_PATH)
        : null;
    const formatted = await format(raw, { ...(resolved || {}), filepath: MANIFEST_PATH });
    return formatted.endsWith('\n') ? formatted : formatted + '\n';
  } catch (error) {
    throw new Error(`Failed to format tool manifest with Prettier: ${error.message}`);
  }
}

async function main() {
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
  const serializedManifest = await formatManifestJson(manifest);
  fs.writeFileSync(MANIFEST_PATH, serializedManifest, 'utf8');

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

const wrappedMain = wrapCLITool(main, 'generate-tool-manifest');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  generateManifest,
  validateManifest,
  formatManifestJson,
  CORE_TOOLS,
  MCP_TOOLS,
  TOOLSETS,
};
