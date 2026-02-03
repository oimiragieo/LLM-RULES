#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');
const { ROUTING_TABLE } = require('../lib/routing/routing-table.cjs');

const CAPABILITY_ROUTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'capability-routing.json'
);
const AGENT_REGISTRY_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'agent-registry.json'
);
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');

function readJsonIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function validateRoutingConsistency() {
  const issues = [];
  const { capabilityMap, defaultAgents, domainFallbacks } = loadCapabilityRouting();
  const registry = readJsonIfExists(AGENT_REGISTRY_PATH);
  const agentIds =
    collectAgentIdsFromRegistry(registry) || collectAgentIdsFromFilesystem();

  for (const [keyword, capability] of Object.entries(capabilityMap)) {
    if (Object.prototype.hasOwnProperty.call(ROUTING_TABLE, keyword)) {
      const routingAgent = ROUTING_TABLE[keyword];
      const capabilityAgent = defaultAgents[capability];
      if (capabilityAgent && routingAgent && capabilityAgent !== routingAgent) {
        issues.push(
          `Keyword "${keyword}" maps to agent "${routingAgent}" in routing-table and to capability "${capability}" (agent "${capabilityAgent}") in capability-routing.`
        );
      }
    }
  }

  for (const agentId of Object.values(defaultAgents)) {
    if (agentId && !agentIds.has(agentId)) {
      issues.push(`defaultAgents references unknown agent: ${agentId}`);
    }
  }

  for (const fallbackList of Object.values(domainFallbacks)) {
    if (!Array.isArray(fallbackList)) continue;
    for (const agentId of fallbackList) {
      if (agentId && !agentIds.has(agentId)) {
        issues.push(`domainFallbacks references unknown agent: ${agentId}`);
      }
    }
  }

  for (const agentId of Object.values(ROUTING_TABLE)) {
    if (agentId && !agentIds.has(agentId)) {
      issues.push(`ROUTING_TABLE references unknown agent: ${agentId}`);
    }
  }

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
