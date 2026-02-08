/**
 * Complexity Classifier
 * =====================
 *
 * Classifies request complexity and risk based on keywords and patterns.
 * Part of enterprise orchestration workflow (Task 2.2).
 */

'use strict';

/**
 * Complexity signals (from enterprise-orchestration-plan.md)
 * Note: auth/security are primarily RISK signals, only HIGH complexity if they're the main focus
 */
const COMPLEXITY_SIGNALS = {
  TRIVIAL: ['fix typo', 'typo', 'rename'],
  LOW: ['add', 'helper', 'validation'],
  MEDIUM: ['refactor', 'improve', 'multiple', 'files', 'update'], // "update" can be MEDIUM if multi-file
  HIGH: ['architecture', 'system', 'design'],
  EPIC: ['migrate', 'rewrite', 'overhaul', 'entire', 'all'],
};

/**
 * Risk signals (from enterprise-orchestration-plan.md)
 */
const RISK_SIGNALS = {
  LOW: [], // Default
  MEDIUM: ['api', 'external', 'data', 'integration'],
  HIGH: ['auth', 'password', 'credentials', 'payment', 'security'],
  CRITICAL: ['production', 'deploy', 'database migration'],
};

/**
 * Phase paths by complexity (from enterprise-workflow.md)
 */
const PHASE_PATHS = {
  TRIVIAL: ['PHASE_0_TRIAGE', 'PHASE_2_IMPLEMENT', 'PHASE_4_DEPLOY'],
  LOW: [
    'PHASE_0_TRIAGE',
    'PHASE_1_DESIGN',
    'PHASE_2_IMPLEMENT',
    'PHASE_3_REVIEW',
    'PHASE_4_DEPLOY',
  ],
  MEDIUM: [
    'PHASE_0_TRIAGE',
    'PHASE_1_DESIGN',
    'PHASE_2_IMPLEMENT',
    'PHASE_3_REVIEW',
    'PHASE_4_DEPLOY',
    'PHASE_5_DOCUMENT',
  ],
  HIGH: [
    'PHASE_0_TRIAGE',
    'PHASE_1_DESIGN',
    'PHASE_2_IMPLEMENT',
    'PHASE_3_REVIEW',
    'PHASE_4_DEPLOY',
    'PHASE_5_DOCUMENT',
    'PHASE_6_REFLECT',
  ],
  EPIC: [
    'PHASE_0_TRIAGE',
    'PHASE_1_DESIGN',
    'PHASE_2_IMPLEMENT',
    'PHASE_3_REVIEW',
    'PHASE_4_DEPLOY',
    'PHASE_5_DOCUMENT',
    'PHASE_6_REFLECT',
  ],
};

/**
 * Classify a request by complexity and risk
 * @param {string} requestText - The user's request text
 * @returns {{ complexity: string, risk: string, phasePath: string[] }}
 */
function classifyRequest(requestText) {
  const normalized = requestText.toLowerCase();

  // Classify complexity (check from highest to lowest priority)
  // Priority: EPIC > MEDIUM (scope) > HIGH (architecture or domain without scope) > LOW > TRIVIAL
  let complexity = 'TRIVIAL';

  // EPIC: migrate, rewrite, overhaul, entire, all (highest priority - always wins)
  if (COMPLEXITY_SIGNALS.EPIC.some(signal => normalized.includes(signal))) {
    complexity = 'EPIC';
  }
  // MEDIUM: refactor, improve, multiple, files (SCOPE signals - take precedence over domain)
  else if (
    normalized.includes('refactor') ||
    normalized.includes('improve') ||
    normalized.includes('multiple') ||
    normalized.includes('files')
  ) {
    complexity = 'MEDIUM';
  }
  // HIGH: architecture, system, design, OR auth/security (ARCHITECTURE or DOMAIN signals, but only if no SCOPE)
  else if (
    normalized.includes('architecture') ||
    normalized.includes('system') ||
    normalized.includes('design') ||
    normalized.includes('auth') ||
    normalized.includes('security')
  ) {
    complexity = 'HIGH';
  }
  // LOW: add, helper, validation (basic operations)
  else if (
    normalized.includes('add') ||
    normalized.includes('helper') ||
    normalized.includes('validation')
  ) {
    complexity = 'LOW';
  }
  // TRIVIAL: default for short or simple requests
  else {
    complexity = 'TRIVIAL';
  }

  // Classify risk (check from highest to lowest)
  let risk = 'LOW';

  // CRITICAL: production, deploy, database migration
  if (RISK_SIGNALS.CRITICAL.some(signal => normalized.includes(signal))) {
    risk = 'CRITICAL';
  }
  // HIGH: auth, password, credentials, payment, security
  else if (RISK_SIGNALS.HIGH.some(signal => normalized.includes(signal))) {
    risk = 'HIGH';
  }
  // MEDIUM: api, external, data, integration
  else if (RISK_SIGNALS.MEDIUM.some(signal => normalized.includes(signal))) {
    risk = 'MEDIUM';
  }

  // Get phase path
  const phasePath = PHASE_PATHS[complexity];

  return {
    complexity,
    risk,
    phasePath,
  };
}

module.exports = {
  classifyRequest,
};
