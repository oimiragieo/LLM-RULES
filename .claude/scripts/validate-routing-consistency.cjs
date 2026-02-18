#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');
const { safeParseJSON } = require('../lib/utils/safe-json.cjs');
const { ROUTING_TABLE, INTENT_TO_AGENT } = require('../lib/routing/routing-table-data.cjs');

const CAPABILITY_ROUTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'capability-routing.json'
);
const AGENT_REGISTRY_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'agent-registry.json');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

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

function validateRoutingConsistency(options = {}) {
  const issues = [];
  const {
    routingTable = ROUTING_TABLE,
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
