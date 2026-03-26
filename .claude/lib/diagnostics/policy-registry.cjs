#!/usr/bin/env node
'use strict';

/**
 * Policy/Domain Registry (Feature F9)
 * ====================================
 * Maps agents to their domain-specific policies, constraints, and
 * allowed invariants. Enables per-agent policy enforcement.
 *
 * Usage:
 *   const { getAgentPolicies, registerPolicy, checkAgentCompliance } = require('./policy-registry.cjs');
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const REGISTRY_FILE = path.join(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'policy-registry.json'
);

/**
 * @typedef {Object} AgentPolicy
 * @property {string} agent_id
 * @property {string[]} allowed_tools - Tools this agent may use
 * @property {string[]} required_skills - Skills this agent must have
 * @property {string[]} invariant_ids - Invariant IDs that apply to this agent
 * @property {string[]} forbidden_paths - Paths this agent must not write to
 * @property {Object} constraints - Additional domain-specific constraints
 */

/**
 * Default policies for core agent types.
 */
const DEFAULT_POLICIES = {
  router: {
    agent_id: 'router',
    allowed_tools: [
      'Task',
      'TaskList',
      'TaskCreate',
      'TaskUpdate',
      'TaskGet',
      'Read',
      'AskUserQuestion',
    ],
    required_skills: [],
    invariant_ids: ['INV-R01', 'INV-R02', 'INV-R03', 'INV-T01', 'INV-T02'],
    forbidden_paths: ['.claude/skills/', '.claude/agents/', '.claude/hooks/'],
    constraints: { max_parallel_spawns: 5 },
  },
  developer: {
    agent_id: 'developer',
    allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskUpdate', 'Skill'],
    required_skills: ['tdd'],
    invariant_ids: ['INV-K01', 'INV-S01', 'INV-S02'],
    forbidden_paths: [],
    constraints: { must_run_tests: true },
  },
  qa: {
    agent_id: 'qa',
    allowed_tools: ['Read', 'Bash', 'Glob', 'Grep', 'TaskUpdate', 'Skill'],
    required_skills: ['tdd', 'verification-before-completion'],
    invariant_ids: ['INV-K01'],
    forbidden_paths: [],
    constraints: { must_verify_before_complete: true },
  },
  'security-architect': {
    agent_id: 'security-architect',
    allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'TaskUpdate', 'Skill', 'WebSearch'],
    required_skills: ['security-architect', 'audit-context-building'],
    invariant_ids: ['INV-K01', 'INV-S01', 'INV-S02'],
    forbidden_paths: [],
    constraints: { must_produce_report: true },
  },
  'code-reviewer': {
    agent_id: 'code-reviewer',
    allowed_tools: ['Read', 'Glob', 'Grep', 'TaskUpdate', 'Skill'],
    required_skills: ['adversarial-review'],
    invariant_ids: ['INV-K01'],
    forbidden_paths: [],
    constraints: { min_findings: 1 },
  },
};

function loadRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = safeParseJSON(raw);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveRegistry(registry) {
  const dir = path.dirname(REGISTRY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Get policies for a specific agent. Falls back to defaults, then to a permissive default.
 * @param {string} agentId
 * @returns {AgentPolicy}
 */
function getAgentPolicies(agentId) {
  const registry = loadRegistry();

  // Check custom registry first
  if (registry[agentId]) return registry[agentId];

  // Check defaults
  if (DEFAULT_POLICIES[agentId]) return DEFAULT_POLICIES[agentId];

  // Permissive fallback for unknown agents
  return {
    agent_id: agentId,
    allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskUpdate', 'Skill'],
    required_skills: [],
    invariant_ids: ['INV-K01', 'INV-S01'],
    forbidden_paths: [],
    constraints: {},
  };
}

/**
 * Register or update a policy for an agent.
 * @param {AgentPolicy} policy
 */
function registerPolicy(policy) {
  if (!policy || !policy.agent_id) {
    throw new Error('Policy must have an agent_id');
  }
  const registry = loadRegistry();
  registry[policy.agent_id] = policy;
  saveRegistry(registry);
}

/**
 * Check if an agent action complies with its policies.
 * @param {string} agentId
 * @param {Object} action
 * @param {string} [action.tool] - Tool being used
 * @param {string} [action.filePath] - File being written to
 * @returns {{ compliant: boolean, violations: string[] }}
 */
function checkAgentCompliance(agentId, action) {
  const policy = getAgentPolicies(agentId);
  const violations = [];

  // Check tool allowlist
  if (action.tool && !policy.allowed_tools.includes(action.tool)) {
    violations.push(`Tool "${action.tool}" not in allowed list for ${agentId}`);
  }

  // Check forbidden paths
  if (action.filePath) {
    const normalized = action.filePath.replace(/\\/g, '/');
    for (const forbidden of policy.forbidden_paths) {
      if (normalized.includes(forbidden)) {
        violations.push(`Path "${normalized}" is forbidden for ${agentId}`);
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

/**
 * Get all registered agent IDs (custom + defaults).
 * @returns {string[]}
 */
function getAllPolicyAgentIds() {
  const registry = loadRegistry();
  const custom = Object.keys(registry);
  const defaults = Object.keys(DEFAULT_POLICIES);
  return [...new Set([...defaults, ...custom])];
}

/**
 * Clear custom registry (keeps defaults intact).
 */
function clearCustomPolicies() {
  saveRegistry({});
}

module.exports = {
  getAgentPolicies,
  registerPolicy,
  checkAgentCompliance,
  getAllPolicyAgentIds,
  clearCustomPolicies,
  DEFAULT_POLICIES,
  REGISTRY_FILE,
};
