'use strict';

/**
 * Implementation Readiness Gate checker.
 * Checks 5 readiness conditions before allowing implementation to proceed.
 */

const GATE_NAMES = [
  'Requirements',
  'TechnicalDesign',
  'DependenciesResolved',
  'TestStrategy',
  'AcceptanceCriteria',
];

/**
 * Gate definitions: { name, contextKey, failReason, passReason }
 */
const GATE_DEFINITIONS = [
  {
    name: 'Requirements',
    contextKey: 'hasRequirements',
    failReason: 'Requirements have not been documented or confirmed',
    passReason: 'Requirements are documented and confirmed',
  },
  {
    name: 'TechnicalDesign',
    contextKey: 'hasTechnicalDesign',
    failReason: 'Technical design or architecture decision is missing',
    passReason: 'Technical design is in place',
  },
  {
    name: 'DependenciesResolved',
    contextKey: 'hasDependenciesResolved',
    failReason: 'External dependencies are unresolved or unknown',
    passReason: 'All dependencies are identified and resolved',
  },
  {
    name: 'TestStrategy',
    contextKey: 'hasTestStrategy',
    failReason: 'Test strategy (unit/integration/e2e) has not been defined',
    passReason: 'Test strategy is defined',
  },
  {
    name: 'AcceptanceCriteria',
    contextKey: 'hasAcceptanceCriteria',
    failReason: 'Acceptance criteria are missing or ambiguous',
    passReason: 'Acceptance criteria are clear and measurable',
  },
];

/**
 * Checks implementation readiness against 5 standard gates.
 * @param {Record<string, boolean>} context - Readiness context flags
 * @returns {{ ready: boolean, gates: Array<{ name: string, passed: boolean, reason: string }> }}
 */
function checkReadiness(context) {
  if (!context || typeof context !== 'object') {
    context = {};
  }

  const gates = GATE_DEFINITIONS.map(def => {
    const passed = context[def.contextKey] === true;
    return {
      name: def.name,
      passed,
      reason: passed ? def.passReason : def.failReason,
    };
  });

  const ready = gates.every(g => g.passed);

  return { ready, gates };
}

module.exports = { checkReadiness, GATE_NAMES };
