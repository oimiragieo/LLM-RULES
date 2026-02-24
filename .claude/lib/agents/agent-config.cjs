'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// Lazy-load schema validator (graceful if missing)
let _validateData = null;
try {
  _validateData = require('../utils/schema-validator.cjs').validateData;
} catch (_e) {
  // Schema validator not available -- skip schema validation
}

const CONFIG_PATH =
  process.env.AGENT_CONFIG_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'config', 'agent-config.json');
let _cache = null;
let _cacheMeta = null;

function _getFileMeta(filePath) {
  const stats = fs.statSync(filePath);
  return {
    mtimeMs: Number(stats.mtimeMs),
    size: Number(stats.size),
  };
}

function _isSameMeta(a, b) {
  return !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function load() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const nextMeta = _getFileMeta(CONFIG_PATH);
      if (_cache && _isSameMeta(_cacheMeta, nextMeta)) {
        return _cache;
      }
      _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      _cacheMeta = nextMeta;
      return _cache;
    }
  } catch (e) {
    process.stderr.write(`[agent-config] Warning: failed to load ${CONFIG_PATH}: ${e.message}\n`);
  }
  _cache = { version: '1.0.0', agents: {}, thinkingBudgetMap: {} };
  _cacheMeta = null;
  return _cache;
}

function normalizeAgentType(agentType) {
  if (!agentType || typeof agentType !== 'string') return '';
  return agentType.trim().toLowerCase();
}

function getAgentConfig(agentType) {
  const key = normalizeAgentType(agentType);
  const config = load();
  const agents = config.agents || {};
  return agents[key] || null;
}

function getDefaultTools(agentType) {
  const entry = getAgentConfig(agentType);
  const tools = entry && Array.isArray(entry.tools) ? entry.tools : null;
  if (tools && tools.length > 0) return tools;
  // Fallback includes Task management and Skill tools so agents can spawn and use skills
  return [
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
    'Skill',
  ];
}

function getDefaultThinkingLevel(agentType) {
  const entry = getAgentConfig(agentType);
  return (entry && entry.thinkingDefault) || 'medium';
}

function getThinkingBudget(thinkingLevel) {
  const config = load();
  const map = config.thinkingBudgetMap || {};
  if (Object.prototype.hasOwnProperty.call(map, thinkingLevel)) {
    return map[thinkingLevel];
  }
  return map.medium ?? 4096;
}

function getPhaseForAgent(agentType) {
  const entry = getAgentConfig(agentType);
  return (entry && entry.phase) || null;
}

function listAgentTypes() {
  const config = load();
  const agents = config.agents || {};
  return Object.keys(agents);
}

/**
 * Validate the loaded agent-config.json against agent-config.schema.json.
 * Advisory only -- returns validation result but does not throw.
 * Graceful degradation if schema or validator is unavailable.
 *
 * @returns {{ valid: boolean, errors: Array|null, skipped?: boolean }}
 */
function validateConfig() {
  const configData = load();
  if (!_validateData) {
    return { valid: true, errors: null, skipped: true };
  }
  const schemaPath = path.join(PROJECT_ROOT, '.claude', 'schemas', 'agent-config.schema.json');
  return _validateData(configData, schemaPath);
}

function clearCache() {
  _cache = null;
  _cacheMeta = null;
}

module.exports = {
  getAgentConfig,
  getDefaultTools,
  getDefaultThinkingLevel,
  getThinkingBudget,
  getPhaseForAgent,
  listAgentTypes,
  clearCache,
  normalizeAgentType,
  validateConfig,
};
