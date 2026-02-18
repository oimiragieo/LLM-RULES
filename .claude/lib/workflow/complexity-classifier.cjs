/**
 * Complexity Classifier
 * =====================
 *
 * Classifies request complexity and risk based on keywords and patterns.
 * Part of enterprise orchestration workflow (Task 2.2).
 */

'use strict';

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(text, word) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, 'i').test(text);
}

function hasAnyWord(text, words) {
  return words.some(word => hasWord(text, word));
}

/**
 * Classify a request by complexity and risk
 * @param {string} requestText - The user's request text
 * @returns {{ complexity: string, risk: string, phasePath: string[] }}
 */
function classifyRequest(requestText) {
  const normalized = requestText.toLowerCase();
  const isDocumentationRequest = hasAnyWord(normalized, [
    'doc',
    'docs',
    'documentation',
    'readme',
    'handbook',
    'guide',
  ]);
  const hasArchitectureSignal = hasAnyWord(normalized, ['architecture', 'system', 'design']);
  const hasDomainSecuritySignal = hasAnyWord(normalized, [
    'auth',
    'authentication',
    'authorization',
    'oauth',
    'security',
  ]);

  // Classify complexity (check from highest to lowest priority)
  // Priority: EPIC > MEDIUM (scope) > HIGH (architecture or domain without scope) > LOW > TRIVIAL
  let complexity = 'TRIVIAL';

  // EPIC: migrate, rewrite, overhaul, entire, all (highest priority - always wins)
  if (
    hasAnyWord(normalized, ['migrate', 'rewrite', 'overhaul', 'entire']) ||
    (hasWord(normalized, 'all') && !hasAnyWord(normalized, ['typo', 'typos', 'doc', 'docs']))
  ) {
    complexity = 'EPIC';
  }
  // MEDIUM: refactor, improve, multiple, files (SCOPE signals - take precedence over domain)
  else if (
    hasAnyWord(normalized, ['refactor', 'improve', 'multiple', 'files'])
  ) {
    complexity = 'MEDIUM';
  }
  // HIGH: architecture, system, design, OR auth/security (ARCHITECTURE or DOMAIN signals, but only if no SCOPE)
  else if (hasArchitectureSignal || (hasDomainSecuritySignal && !isDocumentationRequest)) {
    complexity = 'HIGH';
  }
  // LOW: add, helper, validation (basic operations)
  else if (hasAnyWord(normalized, ['add', 'helper', 'validation'])) {
    complexity = 'LOW';
  }
  // TRIVIAL: default for short or simple requests
  else {
    complexity = 'TRIVIAL';
  }

  // Classify risk (check from highest to lowest)
  let risk = 'LOW';

  // CRITICAL: production, deploy, database migration
  if (
    hasAnyWord(normalized, ['production', 'deploy']) ||
    normalized.includes('database migration')
  ) {
    risk = 'CRITICAL';
  }
  // HIGH: auth, password, credentials, payment, security
  else if (
    hasAnyWord(normalized, [
      'auth',
      'authentication',
      'authorization',
      'oauth',
      'password',
      'credentials',
      'payment',
      'security',
    ])
  ) {
    risk = 'HIGH';
  }
  // MEDIUM: api, external, data, integration
  else if (hasAnyWord(normalized, ['api', 'external', 'data', 'integration'])) {
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
