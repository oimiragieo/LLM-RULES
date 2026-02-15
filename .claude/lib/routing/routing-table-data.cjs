'use strict';

const { ROUTING_TABLE } = require('./routing-table-core-map.cjs');
const { ROUTING_PREFIX_PATTERNS, ROUTING_PATTERNS } = require('./routing-table-patterns.cjs');
const { INTENT_KEYWORDS } = require('./routing-table-intent-keywords.cjs');
const { INTENT_TO_AGENT } = require('./routing-table-intent-agents.cjs');
const { DISAMBIGUATION_RULES } = require('./routing-table-disambiguation.cjs');

function getPreferredAgent(intent) {
  return ROUTING_TABLE[intent] ?? INTENT_TO_AGENT[intent] ?? null;
}

module.exports = {
  ROUTING_TABLE,
  ROUTING_PREFIX_PATTERNS,
  ROUTING_PATTERNS,
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
  DISAMBIGUATION_RULES,
  getPreferredAgent,
};
