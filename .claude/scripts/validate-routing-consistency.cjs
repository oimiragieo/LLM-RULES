#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../lib/utils/safe-json.cjs');
const { ROUTING_TABLE, INTENT_TO_AGENT } = require('../lib/routing/routing-table-data.cjs');
const { DOMAIN_ROUTING_TABLE } = require('../lib/routing/routing-table-hierarchical.cjs');

const CAPABILITY_ROUTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'capability-routing.json'
);
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const MAX_UNIQUE_ROUTING_TARGETS = 27;

function readJsonIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return safeParseJSON(fs.readFileSync(filePath, 'utf8'), null);
    }
  } catch (_err) {
    return null;
  }
  return null;
}

function collectAgentIdsFromRegistry(registry) {
  if (!registry || !registry.agents) return null;
  return new Set(Object.keys(registry.agents));
}

function collectAgentIdsFromFilesystem() {
  const ids = new Set();
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        ids.add(path.basename(entry.name, '.md'));
      }
    }
  }
  scanDir(AGENTS_DIR);
  return ids;
}

function loadCapabilityRouting() {
  const parsed = readJsonIfExists(CAPABILITY_ROUTING_PATH) || {};
  return {
    capabilityMap: parsed.capabilityMap || {},
    defaultAgents: parsed.defaultAgents || {},
    domainFallbacks: parsed.domainFallbacks || {},
  };
}

function checkCapabilityRoutingConsistency(issues, capabilityMap, defaultAgents, routingTable) {
  for (const [keyword, capability] of Object.entries(capabilityMap)) {
    if (!Object.prototype.hasOwnProperty.call(routingTable, keyword)) continue;
    const routingAgent = routingTable[keyword];
    const capabilityAgent = defaultAgents[capability];
    if (capabilityAgent && routingAgent && capabilityAgent !== routingAgent) {
      issues.push(
        `Keyword "${keyword}" maps to agent "${routingAgent}" in routing-table and to capability "${capability}" (agent "${capabilityAgent}") in capability-routing.`
      );
    }
  }
}

function checkAgentReferences(issues, mappingLabel, values, agentIds) {
  for (const agentId of values) {
    if (agentId && !agentIds.has(agentId)) {
      issues.push(`${mappingLabel} references unknown agent: ${agentId}`);
    }
  }
}

function checkDomainFallbacks(issues, domainFallbacks, agentIds) {
  for (const fallbackList of Object.values(domainFallbacks)) {
    if (!Array.isArray(fallbackList)) continue;
    checkAgentReferences(issues, 'domainFallbacks', fallbackList, agentIds);
  }
}

function checkHierarchicalRoutingConsistency(
  issues,
  hierarchicalRoutingTable,
  flatRoutingTable,
  agentIds
) {
  const flatKeywords = Object.keys(flatRoutingTable || {});
  const hierarchicalKeywords = new Set(Object.keys(hierarchicalRoutingTable || {}));
  const missingKeywords = flatKeywords.filter(keyword => !hierarchicalKeywords.has(keyword));

  if (missingKeywords.length > 0) {
    issues.push(
      `DOMAIN_ROUTING_TABLE missing flat keywords: ${missingKeywords.slice(0, 10).join(', ')}${missingKeywords.length > 10 ? ` (+${missingKeywords.length - 10} more)` : ''}`
    );
  }

  const uniqueTargets = new Set();
  for (const [keyword, entry] of Object.entries(hierarchicalRoutingTable || {})) {
    if (!entry || typeof entry !== 'object') {
      issues.push(`DOMAIN_ROUTING_TABLE entry for "${keyword}" must be an object`);
      continue;
    }

    if (entry.type === 'direct') {
      if (!entry.agent) {
        issues.push(`DOMAIN_ROUTING_TABLE direct entry for "${keyword}" is missing agent`);
        continue;
      }
      uniqueTargets.add(entry.agent);
      if (!agentIds.has(entry.agent)) {
        issues.push(`DOMAIN_ROUTING_TABLE references unknown direct agent: ${entry.agent}`);
      }
      continue;
    }

    if (entry.type === 'domain') {
      if (!entry.domain || !entry.router) {
        issues.push(`DOMAIN_ROUTING_TABLE domain entry for "${keyword}" is incomplete`);
        continue;
      }
      uniqueTargets.add(entry.router);
      if (!agentIds.has(entry.router)) {
        issues.push(`DOMAIN_ROUTING_TABLE references unknown domain router: ${entry.router}`);
      }
      continue;
    }

    issues.push(`DOMAIN_ROUTING_TABLE entry for "${keyword}" has invalid type: ${entry.type}`);
  }

  if (uniqueTargets.size > MAX_UNIQUE_ROUTING_TARGETS) {
    issues.push(`DOMAIN_ROUTING_TABLE has too many unique routing targets: ${uniqueTargets.size}`);
  }
}

function validateRoutingConsistency(options = {}) {
  const issues = [];
  const {
    routingTable = ROUTING_TABLE,
    hierarchicalRoutingTable = DOMAIN_ROUTING_TABLE,
    intentToAgent = INTENT_TO_AGENT,
    capabilityRouting = loadCapabilityRouting(),
    registry = readJsonIfExists(AGENT_REGISTRY_PATH),
    agentIds = collectAgentIdsFromRegistry(registry) || collectAgentIdsFromFilesystem(),
  } = options;

  const { capabilityMap = {}, defaultAgents = {}, domainFallbacks = {} } = capabilityRouting;

  checkCapabilityRoutingConsistency(issues, capabilityMap, defaultAgents, routingTable);
  checkAgentReferences(issues, 'defaultAgents', Object.values(defaultAgents), agentIds);
  checkDomainFallbacks(issues, domainFallbacks, agentIds);
  checkAgentReferences(issues, 'ROUTING_TABLE', Object.values(routingTable), agentIds);
  checkHierarchicalRoutingConsistency(issues, hierarchicalRoutingTable, routingTable, agentIds);
  checkAgentReferences(issues, 'INTENT_TO_AGENT', Object.values(intentToAgent), agentIds);

  return issues;
}

function main() {
  const issues = validateRoutingConsistency();
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(issue);
    }
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { validateRoutingConsistency };
