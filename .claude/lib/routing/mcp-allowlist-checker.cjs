'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ALLOWLIST_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'mcp-allowlists.json'
);
const DEFAULT_ALLOWLISTS = Object.freeze({
  router: Object.freeze({
    agent_id: 'router',
    mcp_servers: [],
    mcp_deny: ['*'],
  }),
  developer: Object.freeze({
    agent_id: 'developer',
    mcp_servers: [{ name: 'filesystem', tools_allowed: ['*'] }],
    mcp_deny: [],
  }),
  researcher: Object.freeze({
    agent_id: 'researcher',
    mcp_servers: [],
    mcp_deny: ['chrome-devtools'],
  }),
  'security-architect': Object.freeze({
    agent_id: 'security-architect',
    mcp_servers: [{ name: 'filesystem', tools_allowed: ['read_text_file'] }],
    mcp_deny: [],
  }),
  qa: Object.freeze({
    agent_id: 'qa',
    mcp_servers: [{ name: 'filesystem', tools_allowed: ['*'] }],
    mcp_deny: [],
  }),
});

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function readRegisteredAllowlists() {
  try {
    if (!fs.existsSync(ALLOWLIST_FILE)) return {};
    const raw = fs.readFileSync(ALLOWLIST_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function writeRegisteredAllowlists(allowlists) {
  fs.mkdirSync(path.dirname(ALLOWLIST_FILE), { recursive: true });
  fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify(allowlists, null, 2), 'utf8');
}

function sanitizeAllowlist(config) {
  return {
    agent_id: String(config.agent_id || '').trim(),
    mcp_servers: Array.isArray(config.mcp_servers)
      ? config.mcp_servers.map(server => ({
          name: String(server.name || '').trim(),
          tools_allowed: Array.isArray(server.tools_allowed) ? [...server.tools_allowed] : [],
        }))
      : [],
    mcp_deny: Array.isArray(config.mcp_deny) ? [...config.mcp_deny] : [],
  };
}

function registerMcpAllowlist(config) {
  const sanitized = sanitizeAllowlist(config);
  const allowlists = readRegisteredAllowlists();
  allowlists[sanitized.agent_id] = sanitized;
  writeRegisteredAllowlists(allowlists);
  return sanitized;
}

function getAllowlist(agentId) {
  const custom = readRegisteredAllowlists();
  return custom[agentId] || DEFAULT_ALLOWLISTS[agentId] || null;
}

function isToolAllowed(agentId, serverName, toolName) {
  const allowlist = getAllowlist(agentId);
  if (!allowlist) {
    return { allowed: true, reason: 'no-policy' };
  }

  const normalizedServer = normalizeName(serverName);
  const denyList = (allowlist.mcp_deny || []).map(normalizeName);
  if (denyList.includes('*') || denyList.includes(normalizedServer)) {
    return { allowed: false, reason: 'server-denied' };
  }

  const serverPolicy = (allowlist.mcp_servers || []).find(
    server => normalizeName(server.name) === normalizedServer
  );
  if (!serverPolicy) {
    return { allowed: true, reason: 'server-not-listed' };
  }

  if (!toolName) {
    return { allowed: true, reason: 'server-allowed' };
  }

  const toolsAllowed = Array.isArray(serverPolicy.tools_allowed) ? serverPolicy.tools_allowed : [];
  const allowed =
    toolsAllowed.includes('*') || toolsAllowed.includes(String(toolName || '').trim());
  return { allowed, reason: allowed ? 'tool-allowed' : 'tool-denied' };
}

module.exports = {
  ALLOWLIST_FILE,
  DEFAULT_ALLOWLISTS,
  isToolAllowed,
  registerMcpAllowlist,
};
