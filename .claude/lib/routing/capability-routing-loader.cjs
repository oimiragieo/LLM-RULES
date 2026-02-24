'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const CAPABILITY_ROUTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'capability-routing.json'
);

let cache = null;

function loadCapabilityRouting() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf8');
    const parsed = safeParseJSON(raw);
    cache = {
      capabilityMap:
        parsed && parsed.capabilityMap && typeof parsed.capabilityMap === 'object'
          ? parsed.capabilityMap
          : null,
      defaultAgents:
        parsed && parsed.defaultAgents && typeof parsed.defaultAgents === 'object'
          ? parsed.defaultAgents
          : null,
      domainFallbacks:
        parsed && parsed.domainFallbacks && typeof parsed.domainFallbacks === 'object'
          ? parsed.domainFallbacks
          : null,
      capabilityPriorityOrder:
        parsed && parsed.capabilityPriority && Array.isArray(parsed.capabilityPriority.order)
          ? parsed.capabilityPriority.order
          : [],
      routingConditions:
        parsed && parsed.routingConditions && typeof parsed.routingConditions === 'object'
          ? parsed.routingConditions
          : null,
    };
    return cache;
  } catch (_err) {
    cache = {
      capabilityMap: null,
      defaultAgents: null,
      domainFallbacks: null,
      capabilityPriorityOrder: [],
      routingConditions: null,
    };
    return cache;
  }
}

function resetCache() {
  cache = null;
}

module.exports = { loadCapabilityRouting, resetCache, CAPABILITY_ROUTING_PATH };
