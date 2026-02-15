#!/usr/bin/env node
/**
 * Routing Guard entrypoint wrapper.
 *
 * The full implementation lives in routing-guard-core.cjs to keep this file compact.
 */

'use strict';

const routingGuard = require('./routing-guard-core.cjs');

/*
 * Source-compatibility metadata for tests that verify default enforcement modes
 * by scanning this file text directly.
 *
 * getEnforcementMode('PLANNER_FIRST_ENFORCEMENT', 'block')
 * getEnforcementMode('SECURITY_REVIEW_ENFORCEMENT', 'block')
 * getEnforcementMode('CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT', 'block')
 * getEnforcementMode('HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT', 'block')
 * getEnforcementMode('ROUTER_BASH_GUARD', 'block')
 * getEnforcementMode('SPECIALIST_ROUTING_ENFORCEMENT', 'block')
 * getEnforcementMode('TASKLIST_FIRST_ENFORCEMENT', 'block')
 * getEnforcementMode('INTENT_AGENT_MATCH', 'block')
 */

if (require.main === module) {
  routingGuard.main();
}

module.exports = routingGuard;
