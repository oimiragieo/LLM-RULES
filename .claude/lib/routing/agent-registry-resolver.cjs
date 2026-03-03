'use strict';

const { getPreferredAgent } = require('./routing-table.cjs');
const { loadCapabilityRouting } = require('./capability-routing-loader.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

function loadCapabilityRoutingForResolver() {
  const loaded = loadCapabilityRouting();
  return safeParseJSON(JSON.stringify(loaded || {}), null, null, {});
}

const CAPABILITY_TO_DOMAIN = {
  'code-review': 'code',
  implementation: 'code',
  'bug-fixing': 'code',
  testing: 'testing',
  'security-review': 'security',
  'architecture-design': 'architecture',
  documentation: 'documentation',
  devops: 'devops',
  'incident-response': 'devops',
  planning: 'architecture',
  orchestration: 'orchestration',
  research: 'research',
};

function resolveRegistryHealth(registry, agentId) {
  if (!registry || !registry.agents || !agentId) return null;
  const agent = registry.agents[agentId];
  return agent && agent.health ? agent.health.status : null;
}

function isAgentAllowed(agentId, options) {
  if (!agentId) return false;
  if (!options || !options.excludeUnhealthy) return true;
  const status = resolveRegistryHealth(options.registry, agentId);
  if (!status) return true;
  return status !== 'unavailable';
}

function getAgentForCapability(capability) {
  const capRouting = loadCapabilityRoutingForResolver();
  if (!capability || !capRouting?.defaultAgents) return null;
  return capRouting.defaultAgents[capability] || null;
}

function getAgentForIntent(intent) {
  if (!intent) return null;
  const direct = getPreferredAgent(intent);
  if (direct) return direct;
  const capRouting = loadCapabilityRoutingForResolver();
  const capability = capRouting?.capabilityMap ? capRouting.capabilityMap[intent] : null;
  if (capability && capRouting?.defaultAgents) {
    return capRouting.defaultAgents[capability] || null;
  }
  return null;
}

function getAgentsForCapabilityWithFallbacks(capability, options = {}) {
  const capRouting = loadCapabilityRoutingForResolver();
  const agents = [];
  const primary = getAgentForCapability(capability);
  if (primary && isAgentAllowed(primary, options)) agents.push(primary);

  const domain = CAPABILITY_TO_DOMAIN[capability];
  if (domain && capRouting?.domainFallbacks && Array.isArray(capRouting.domainFallbacks[domain])) {
    for (const fallback of capRouting.domainFallbacks[domain]) {
      if (!agents.includes(fallback) && isAgentAllowed(fallback, options)) {
        agents.push(fallback);
      }
    }
  }

  return agents;
}

module.exports = {
  getAgentForIntent,
  getAgentForCapability,
  getAgentsForCapabilityWithFallbacks,
  loadCapabilityRoutingForResolver,
};
