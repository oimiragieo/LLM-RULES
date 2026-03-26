#!/usr/bin/env node
'use strict';

/**
 * MCP Allowlist Checker (Feature G6)
 * ====================================
 * Validates whether an agent is permitted to use a specific MCP server/tool.
 *
 * Usage:
 *   const { isToolAllowed, getAgentMcpConfig } = require('./mcp-allowlist-checker.cjs');
 *
 *   const allowed = isToolAllowed('developer', 'filesystem', 'read_file');
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const ALLOWLIST_FILE = path.join(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'mcp-allowlists.json'
);

/**
 * Default MCP allowlists for core agents.
 */
const DEFAULT_ALLOWLISTS = {
  developer: {
    agent_id: 'developer',
    mcp_servers: [
      { name: 'filesystem', tools_allowed: [] },
      { name: 'Exa', tools_allowed: ['get_code_context_exa'] },
    ],
    mcp_deny: [],
  },
  researcher: {
    agent_id: 'researcher',
    mcp_servers: [
      { name: 'Exa', tools_allowed: [] },
      { name: 'Ref', tools_allowed: [] },
      { name: 'claude.ai Hugging Face', tools_allowed: [] },
    ],
    mcp_deny: ['chrome-devtools'],
  },
  'security-architect': {
    agent_id: 'security-architect',
    mcp_servers: [
      { name: 'filesystem', tools_allowed: ['read_text_file', 'list_directory', 'search_files'] },
      { name: 'Exa', tools_allowed: ['web_search_exa'] },
    ],
    mcp_deny: [],
  },
  qa: {
    agent_id: 'qa',
    mcp_servers: [
      { name: 'filesystem', tools_allowed: [] },
      { name: 'chrome-devtools', tools_allowed: [] },
    ],
    mcp_deny: [],
  },
  router: {
    agent_id: 'router',
    mcp_servers: [],
    mcp_deny: ['filesystem', 'chrome-devtools', 'Exa', 'Ref'],
  },
};

/**
 * Check if an agent is allowed to use a specific MCP tool.
 * @param {string} agentId
 * @param {string} serverName - MCP server name
 * @param {string} [toolName] - Specific tool name (optional)
 * @returns {{ allowed: boolean, reason?: string }}
 */
function isToolAllowed(agentId, serverName, toolName) {
  const config = getAgentMcpConfig(agentId);

  // Check deny list first
  if (config.mcp_deny && config.mcp_deny.includes(serverName)) {
    return { allowed: false, reason: `Server "${serverName}" is denied for agent ${agentId}` };
  }

  // Check allowlist
  const serverConfig = config.mcp_servers.find(s => s.name === serverName);
  if (!serverConfig) {
    // No explicit allow — permissive for agents without config, restrictive for router
    if (agentId === 'router') {
      return { allowed: false, reason: `Router has no MCP server access` };
    }
    return { allowed: true, reason: 'No explicit restriction' };
  }

  // Server is allowed — check tool restrictions
  if (toolName && serverConfig.tools_allowed && serverConfig.tools_allowed.length > 0) {
    if (!serverConfig.tools_allowed.includes(toolName)) {
      return { allowed: false, reason: `Tool "${toolName}" not in allowlist for ${serverName}` };
    }
  }

  return { allowed: true };
}

/**
 * Get MCP configuration for an agent.
 * @param {string} agentId
 * @returns {Object} MCP allowlist config
 */
function getAgentMcpConfig(agentId) {
  // Check custom config first
  const custom = loadCustomConfig();
  if (custom[agentId]) return custom[agentId];

  // Fallback to defaults
  if (DEFAULT_ALLOWLISTS[agentId]) return DEFAULT_ALLOWLISTS[agentId];

  // Permissive default for unknown agents
  return { agent_id: agentId, mcp_servers: [], mcp_deny: [] };
}

/**
 * Register a custom MCP allowlist for an agent.
 * @param {Object} config
 */
function registerMcpAllowlist(config) {
  const custom = loadCustomConfig();
  custom[config.agent_id] = config;
  saveCustomConfig(custom);
}

function loadCustomConfig() {
  try {
    const raw = fs.readFileSync(ALLOWLIST_FILE, 'utf8');
    const parsed = safeParseJSON(raw);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveCustomConfig(config) {
  const dir = path.dirname(ALLOWLIST_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
  isToolAllowed,
  getAgentMcpConfig,
  registerMcpAllowlist,
  DEFAULT_ALLOWLISTS,
  ALLOWLIST_FILE,
};
