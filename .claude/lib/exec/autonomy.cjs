'use strict';

/**
 * Autonomy tier definitions and permission enforcement for headless execution.
 *
 * Tiers (ordered from most to least restrictive):
 *   readOnly        - Read-only operations only
 *   low             - File edits allowed, no execution
 *   medium          - Execution allowed, no git push
 *   high            - Git push allowed, all standard tools
 *   skipPermissions - All tools allowed (no guardrails)
 */

/** Ordered tier names from most to least restrictive */
const TIER_ORDER = ['readOnly', 'low', 'medium', 'high', 'skipPermissions'];

/**
 * AUTONOMY_TIERS maps tier names to the set of allowed tool names.
 * The value '*' means all tools are permitted.
 */
const AUTONOMY_TIERS = {
  readOnly: ['Read', 'LS', 'Grep', 'Glob'],
  low: ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch'],
  medium: ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch', 'Execute'],
  high: ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch', 'Execute', 'GitPush'],
  skipPermissions: '*',
};

/**
 * Thrown when a tool call exceeds the current autonomy tier.
 * Carries structured context: toolName, currentTier, requiredTier.
 */
class PermissionViolationError extends Error {
  /**
   * @param {object} params
   * @param {string} params.toolName     - The tool that was blocked
   * @param {string} params.currentTier  - The active autonomy tier
   * @param {string} params.requiredTier - Minimum tier needed for this tool
   */
  constructor({ toolName, currentTier, requiredTier }) {
    super(
      `Tool "${toolName}" is not allowed in autonomy tier "${currentTier}". ` +
        `Minimum required tier: "${requiredTier}".`
    );
    this.name = 'PermissionViolationError';
    this.toolName = toolName;
    this.currentTier = currentTier;
    this.requiredTier = requiredTier;
  }
}

/**
 * Enforces tool-use permissions based on the configured autonomy tier.
 */
class PermissionEnforcer {
  /**
   * @param {string} tier - One of the keys in AUTONOMY_TIERS
   */
  constructor(tier) {
    if (!Object.prototype.hasOwnProperty.call(AUTONOMY_TIERS, tier)) {
      throw new Error(`Unknown autonomy tier: "${tier}". Valid tiers: ${TIER_ORDER.join(', ')}.`);
    }
    this.tier = tier;
  }

  /**
   * Check whether a tool is permitted under the current tier.
   *
   * @param {string} toolName
   * @returns {{ allowed: true } | { allowed: false, requiredTier: string }}
   */
  canUseTool(toolName) {
    const allowed = AUTONOMY_TIERS[this.tier];

    // skipPermissions wildcard — everything is allowed
    if (allowed === '*') {
      return { allowed: true };
    }

    if (allowed.includes(toolName)) {
      return { allowed: true };
    }

    // Determine the minimum tier that permits this tool
    let requiredTier = 'skipPermissions'; // fallback: only skip-permissions allows it
    for (const tier of TIER_ORDER) {
      const tierAllowed = AUTONOMY_TIERS[tier];
      if (tierAllowed === '*' || tierAllowed.includes(toolName)) {
        requiredTier = tier;
        break;
      }
    }

    return { allowed: false, requiredTier };
  }

  /**
   * Enforce permission for a tool call.
   * Throws PermissionViolationError if the tool is not allowed.
   *
   * @param {string} toolName
   * @throws {PermissionViolationError}
   */
  enforce(toolName) {
    const result = this.canUseTool(toolName);
    if (!result.allowed) {
      throw new PermissionViolationError({
        toolName,
        currentTier: this.tier,
        requiredTier: result.requiredTier,
      });
    }
  }
}

module.exports = {
  AUTONOMY_TIERS,
  TIER_ORDER,
  PermissionViolationError,
  PermissionEnforcer,
};
