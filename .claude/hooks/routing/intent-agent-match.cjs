#!/usr/bin/env node
/**
 * Intent-Agent Match Hook
 * =======================
 *
 * PreToolUse hook on Task tool that validates the router is spawning
 * the right agent type for the detected intent.
 *
 * Task #38 (Deliverable 1) - Enterprise Orchestration Phase 4
 *
 * Trigger: PreToolUse (tool_name: Task)
 * Mode: warn (suggests correct agent but doesn't block)
 *
 * Intent Detection Rules:
 * - Security signals (auth, credential, permission, vulnerability) → security-architect
 * - Testing signals (test, coverage, regression, assertion) → qa
 * - Architecture signals (design, schema, database, migration, scalability) → architect
 * - Documentation signals (docs, readme, guide, tutorial, API reference) → technical-writer
 * - Deployment signals (deploy, CI/CD, pipeline, docker, kubernetes) → devops
 * - Planning signals (plan, design, strategy, roadmap, breakdown) → planner
 *
 * @module intent-agent-match
 */

'use strict';

const path = require('path');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');

// =============================================================================
// INTENT SIGNAL PATTERNS
// =============================================================================

/**
 * Intent categories with their keyword signals and recommended agents
 */
const INTENT_PATTERNS = {
  security: {
    keywords: [
      'auth',
      'credential',
      'permission',
      'vulnerability',
      'OWASP',
      'security',
      'password',
      'token',
      'encrypt',
      'decrypt',
    ],
    agents: ['security-architect'],
    weight: 10,
  },
  testing: {
    keywords: [
      'test',
      'coverage',
      'regression',
      'assertion',
      'unit test',
      'integration test',
      'e2e',
      'qa',
    ],
    agents: ['qa'],
    weight: 8,
  },
  architecture: {
    keywords: [
      'design',
      'schema',
      'database',
      'migration',
      'scalability',
      'architecture',
      'system design',
    ],
    agents: ['architect'],
    weight: 9,
  },
  documentation: {
    keywords: ['docs', 'readme', 'guide', 'tutorial', 'API reference', 'documentation', 'API doc'],
    agents: ['technical-writer'],
    weight: 7,
  },
  deployment: {
    keywords: ['deploy', 'CI/CD', 'pipeline', 'docker', 'kubernetes', 'k8s', 'deployment'],
    agents: ['devops'],
    weight: 8,
  },
  planning: {
    keywords: ['plan', 'strategy', 'roadmap', 'breakdown', 'planning'],
    agents: ['planner'],
    weight: 9,
  },
};

// =============================================================================
// INTENT DETECTION
// =============================================================================

/**
 * Detect intent signals in the prompt text
 * @param {string} text - The prompt text to analyze
 * @returns {{ detectedSignals: string[], suggestedAgents: string[] }}
 */
function detectIntent(text) {
  const normalized = text.toLowerCase();
  const detectedSignals = [];
  const suggestedAgents = new Set();

  for (const [_intent, config] of Object.entries(INTENT_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        detectedSignals.push(keyword);
        for (const agent of config.agents) {
          suggestedAgents.add(agent);
        }
      }
    }
  }

  return {
    detectedSignals: [...new Set(detectedSignals)],
    suggestedAgents: Array.from(suggestedAgents),
  };
}

/**
 * Check if the spawned agent type matches the detected intent
 * @param {string} subagentType - The agent being spawned
 * @param {string[]} suggestedAgents - The agents suggested by intent analysis
 * @returns {boolean} True if match or no suggestion, false if mismatch
 */
function agentMatchesIntent(subagentType, suggestedAgents) {
  if (suggestedAgents.length === 0) {
    return true; // No specific intent detected, any agent is ok
  }

  return suggestedAgents.includes(subagentType);
}

// =============================================================================
// HOOK LOGIC
// =============================================================================

/**
 * Process intent check for Task tool invocation
 * @param {Object} hookData - The parsed hook input data
 * @returns {{ result: string|{}, reason?: string }}
 */
function processIntentCheck(hookData) {
  const toolName = getToolName(hookData);

  // Only applies to Task tool
  if (toolName !== 'Task') {
    return { result: {} };
  }

  const toolInput = getToolInput(hookData);
  const subagentType = toolInput.subagent_type || 'general-purpose';
  const prompt = toolInput.prompt || '';

  // Detect intent signals in the prompt
  const { detectedSignals, suggestedAgents } = detectIntent(prompt);

  // Check if spawned agent matches detected intent
  if (!agentMatchesIntent(subagentType, suggestedAgents)) {
    const reason = `Intent signals [${detectedSignals.join(', ')}] detected but spawning '${subagentType}' instead of including '${suggestedAgents.join("' or '")}'`;
    return {
      result: 'warn',
      reason,
    };
  }

  // All good
  return { result: {} };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main entry point for intent-agent-match hook
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  try {
    // Parse hook input
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input - allow
      process.exit(0);
    }

    // Process the check
    const result = processIntentCheck(hookInput);

    // Output result
    if (result.result === 'warn') {
      console.warn(`[INTENT-AGENT MATCH] ${result.reason}`);
      console.log(formatResult('warn', result.reason));
      process.exit(0);
    }

    // Allow
    process.exit(0);
  } catch (err) {
    // Fail open on error (non-critical check)
    console.error(`[intent-agent-match] Error: ${err.message}`);
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  processIntentCheck,
  detectIntent,
  agentMatchesIntent,
  INTENT_PATTERNS,
};
