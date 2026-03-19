'use strict';

/**
 * Invariant-Based Agent Validation
 *
 * Generates and checks invariants from agent frontmatter definitions.
 * Uses a CLEAR_PASS / CLEAR_FAIL / UNCLEAR trichotomy:
 *   - CLEAR_PASS: action is explicitly allowed
 *   - CLEAR_FAIL: action violates a concrete invariant
 *   - UNCLEAR: cannot determine (logged but not blocked)
 *
 * Invariant types:
 *   - allowed_tools: tools listed in agent frontmatter
 *   - allowed_skills: skills listed in agent frontmatter
 *   - required_model: model specified in agent frontmatter
 *   - agent_name: agent identity check
 *
 * @module invariant-checker
 */

const Verdict = Object.freeze({
  CLEAR_PASS: 'clear_pass',
  CLEAR_FAIL: 'clear_fail',
  UNCLEAR: 'unclear',
});

/**
 * Generate invariants from agent frontmatter.
 *
 * @param {Object|null} frontmatter - Parsed agent frontmatter
 * @returns {Array<Object>} invariant rules
 */
function generateInvariants(frontmatter) {
  if (!frontmatter) return [];

  const invariants = [];

  // Agent name invariant
  if (frontmatter.name) {
    invariants.push({
      type: 'agent_name',
      name: frontmatter.name,
    });
  }

  // Tool allowlist invariant
  invariants.push({
    type: 'allowed_tools',
    allowedTools: Array.isArray(frontmatter.tools) ? [...frontmatter.tools] : [],
  });

  // Skill allowlist invariant
  invariants.push({
    type: 'allowed_skills',
    allowedSkills: Array.isArray(frontmatter.skills) ? [...frontmatter.skills] : [],
  });

  // Model requirement invariant
  if (frontmatter.model) {
    invariants.push({
      type: 'required_model',
      model: frontmatter.model,
    });
  }

  return invariants;
}

/**
 * Check a single invariant against an action.
 *
 * @param {Object} invariant
 * @param {Object} action - { tool?, skill?, model?, ... }
 * @returns {{ verdict: string, reason: string, invariantType: string }}
 */
function checkInvariant(invariant, action) {
  const type = invariant.type;

  switch (type) {
    case 'allowed_tools': {
      if (!action.tool) {
        return {
          verdict: Verdict.UNCLEAR,
          reason: 'no tool in action to check',
          invariantType: type,
        };
      }
      const allowed = invariant.allowedTools || [];
      if (allowed.includes(action.tool)) {
        return {
          verdict: Verdict.CLEAR_PASS,
          reason: `tool ${action.tool} is in allowed list`,
          invariantType: type,
        };
      }
      return {
        verdict: Verdict.CLEAR_FAIL,
        reason: `tool ${action.tool} is not in allowed list [${allowed.join(', ')}]`,
        invariantType: type,
      };
    }

    case 'allowed_skills': {
      if (!action.skill) {
        return {
          verdict: Verdict.UNCLEAR,
          reason: 'no skill in action to check',
          invariantType: type,
        };
      }
      const allowed = invariant.allowedSkills || [];
      if (allowed.includes(action.skill)) {
        return {
          verdict: Verdict.CLEAR_PASS,
          reason: `skill ${action.skill} is in allowed list`,
          invariantType: type,
        };
      }
      // Skills not in list are UNCLEAR (advisory, not blocked)
      // Agents can discover and use skills not explicitly listed
      return {
        verdict: Verdict.UNCLEAR,
        reason: `skill ${action.skill} not in declared list (advisory)`,
        invariantType: type,
      };
    }

    case 'required_model': {
      if (!action.model) {
        return {
          verdict: Verdict.UNCLEAR,
          reason: 'no model in action to check',
          invariantType: type,
        };
      }
      if (action.model === invariant.model) {
        return {
          verdict: Verdict.CLEAR_PASS,
          reason: `model matches required: ${invariant.model}`,
          invariantType: type,
        };
      }
      return {
        verdict: Verdict.CLEAR_FAIL,
        reason: `model ${action.model} does not match required ${invariant.model}`,
        invariantType: type,
      };
    }

    case 'agent_name': {
      // Agent name is informational, always passes
      return {
        verdict: Verdict.CLEAR_PASS,
        reason: `agent: ${invariant.name}`,
        invariantType: type,
      };
    }

    default:
      return {
        verdict: Verdict.UNCLEAR,
        reason: `unknown invariant type: ${type}`,
        invariantType: type,
      };
  }
}

/**
 * Check all invariants against an action.
 * Overall verdict: CLEAR_FAIL if any fail, UNCLEAR if any unclear (and no fails),
 * CLEAR_PASS only if all pass.
 *
 * @param {Array<Object>} invariants
 * @param {Object} action
 * @returns {{ verdict: string, checks: Array, agentName?: string }}
 */
function checkAction(invariants, action) {
  if (!invariants || invariants.length === 0) {
    return { verdict: Verdict.CLEAR_PASS, checks: [] };
  }

  const checks = invariants.map(inv => checkInvariant(inv, action));

  // Extract agent name from agent_name invariant
  const nameInvariant = invariants.find(i => i.type === 'agent_name');
  const agentName = nameInvariant ? nameInvariant.name : undefined;

  // Determine overall verdict
  const hasFail = checks.some(c => c.verdict === Verdict.CLEAR_FAIL);
  const hasUnclear = checks.some(c => c.verdict === Verdict.UNCLEAR);

  let verdict;
  if (hasFail) {
    verdict = Verdict.CLEAR_FAIL;
  } else if (hasUnclear) {
    verdict = Verdict.UNCLEAR;
  } else {
    verdict = Verdict.CLEAR_PASS;
  }

  return {
    verdict,
    checks,
    ...(agentName ? { agentName } : {}),
  };
}

module.exports = {
  generateInvariants,
  checkInvariant,
  checkAction,
  Verdict,
};
