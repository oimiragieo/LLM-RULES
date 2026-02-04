'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const CONFIG_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'agent-config.json');
let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return _cache;
    }
  } catch (_e) {
    // ignore and fall through to defaults
  }
  _cache = { version: '1.0.0', agents: {}, thinkingBudgetMap: {} };
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
  return ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
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

function clearCache() {
  _cache = null;
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
};
