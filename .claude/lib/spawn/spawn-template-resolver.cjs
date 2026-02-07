'use strict';
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'spawn');

const ORCHESTRATOR_IDS = new Set([
  'router',
  'master-orchestrator',
  'evolution-orchestrator',
  'swarm-coordinator',
  'party-orchestrator',
]);

/**
 * Resolves the appropriate spawn template based on agent type and options.
 *
 * @param {string} agentType - The agent type (e.g., 'developer', 'router', 'master-orchestrator')
 * @param {Object} [options={}] - Template selection options
 * @param {string} [options.templateName] - Explicit template override
 * @param {boolean} [options.oneShot] - Use one-shot subordinate template
 * @param {string} [options.category] - Agent category (e.g., 'orchestrator')
 * @param {boolean} [options.hasIdentity] - Agent has identity frontmatter
 * @returns {{templateName: string, templatePath: string, reason: string}} Resolved template info
 */
function resolveSpawnTemplate(agentType, options = {}) {
  const normalized = String(agentType || '').toLowerCase().trim();

  // Priority 1: Explicit override
  if (options.templateName) {
    const explicitPath = path.join(TEMPLATES_DIR, options.templateName);
    if (fs.existsSync(explicitPath)) {
      return {
        templateName: options.templateName,
        templatePath: explicitPath,
        reason: 'explicit_override',
      };
    }
  }

  // Priority 2: One-shot subordinate
  if (options.oneShot === true) {
    return {
      templateName: 'subordinate-once.md',
      templatePath: path.join(TEMPLATES_DIR, 'subordinate-once.md'),
      reason: 'one_shot_mode',
    };
  }

  // Priority 3: Orchestrator agents
  if (ORCHESTRATOR_IDS.has(normalized) || options.category === 'orchestrator') {
    return {
      templateName: 'orchestrator-spawn.md',
      templatePath: path.join(TEMPLATES_DIR, 'orchestrator-spawn.md'),
      reason: 'orchestrator_agent',
    };
  }

  // Priority 4: Identity frontmatter
  if (options.hasIdentity === true) {
    return {
      templateName: 'agent-identity-integration.md',
      templatePath: path.join(TEMPLATES_DIR, 'agent-identity-integration.md'),
      reason: 'identity_frontmatter',
    };
  }

  // Priority 5: Default
  return {
    templateName: 'universal-agent-spawn.md',
    templatePath: path.join(TEMPLATES_DIR, 'universal-agent-spawn.md'),
    reason: 'default',
  };
}

module.exports = { resolveSpawnTemplate, ORCHESTRATOR_IDS };
