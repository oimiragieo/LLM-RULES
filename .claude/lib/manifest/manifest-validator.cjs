'use strict';
// <!-- Agent: developer | Task: #S2-agent-manifest | Session: 2026-04-20 -->

/**
 * manifest-validator.cjs
 *
 * v3.0.0 Agent Manifest Validator
 * Validates agent manifests against the agent-manifest.schema.json contract.
 * BC-2: agents without a manifest block fail startup in strict mode.
 */

const MANIFEST_VERSION = '1.0';

const VALID_MEMORY_TIERS = ['STM', 'MTM', 'LTM', 'NONE'];
const VALID_SESSION_TYPES = ['ephemeral', 'persistent', 'delegated'];
const VALID_AGENT_TYPES = [
  'core',
  'specialized',
  'orchestrator',
  'security',
  'domain',
  'creator',
  'monitor',
  'imported',
];
const VALID_PREFERRED_MODELS = [
  'haiku',
  'sonnet',
  'opus',
  'inherit',
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-5-20251101',
];
const VALID_MANIFEST_VERSIONS = ['1.0'];

const TOKENS_MIN = 1000;
const TOKENS_MAX = 2000000;
const USD_MIN = 0.001;

/**
 * ManifestStartupError
 *
 * Thrown by loadManifest() in strict mode when a manifest is absent or invalid.
 * BC-2 enforcement: "BC-2: agent manifest required in v3.0.0; run pnpm migrate:2x-to-3"
 */
class ManifestStartupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestStartupError';
  }
}

// ── Sub-validators ────────────────────────────────────────────────────────────

function validateManifestVersion(manifest, errors) {
  let upgradeHint;
  if (manifest.manifest_version === undefined || manifest.manifest_version === null) {
    errors.push('manifest_version is required');
    upgradeHint = `Run 'pnpm migrate:2x-to-3' to upgrade to manifest_version '${MANIFEST_VERSION}'.`;
  } else if (!VALID_MANIFEST_VERSIONS.includes(manifest.manifest_version)) {
    errors.push(
      `manifest_version '${manifest.manifest_version}' is not valid; allowed: ${VALID_MANIFEST_VERSIONS.join(', ')}`
    );
  }
  return upgradeHint;
}

function validateAgentId(manifest, errors) {
  if (manifest.agent_id === undefined || manifest.agent_id === null) {
    errors.push('agent_id is required');
  } else if (typeof manifest.agent_id !== 'string' || manifest.agent_id.length < 2) {
    errors.push('agent_id must be a string with at least 2 characters');
  }
}

function validateAgentType(manifest, errors) {
  if (manifest.agent_type === undefined || manifest.agent_type === null) {
    errors.push('agent_type is required');
  } else if (!VALID_AGENT_TYPES.includes(manifest.agent_type)) {
    errors.push(
      `agent_type '${manifest.agent_type}' is not valid; allowed: ${VALID_AGENT_TYPES.join(', ')}`
    );
  }
}

function validateCapabilityItem(cap, i, errors) {
  if (!cap || typeof cap !== 'object') {
    errors.push(`capabilities[${i}] must be an object`);
    return;
  }
  if (!cap.tool_name || typeof cap.tool_name !== 'string') {
    errors.push(`capabilities[${i}].tool_name is required and must be a string`);
  }
  if (typeof cap.allowed !== 'boolean') {
    errors.push(`capabilities[${i}].allowed is required and must be a boolean`);
  }
  if (cap.rate_limit !== undefined) {
    if (typeof cap.rate_limit !== 'object' || Array.isArray(cap.rate_limit)) {
      errors.push(`capabilities[${i}].rate_limit must be an object`);
    } else if (
      cap.rate_limit.calls_per_task === undefined ||
      typeof cap.rate_limit.calls_per_task !== 'number' ||
      cap.rate_limit.calls_per_task < 1
    ) {
      errors.push(`capabilities[${i}].rate_limit.calls_per_task is required and must be >= 1`);
    }
  }
}

function validateCapabilities(manifest, errors) {
  if (manifest.capabilities === undefined || manifest.capabilities === null) {
    errors.push('capabilities is required');
  } else if (!Array.isArray(manifest.capabilities)) {
    errors.push('capabilities must be an array');
  } else {
    manifest.capabilities.forEach((cap, i) => validateCapabilityItem(cap, i, errors));
  }
}

function validateMemoryTier(manifest, errors) {
  if (manifest.memory_tier === undefined || manifest.memory_tier === null) {
    errors.push('memory_tier is required');
  } else if (!VALID_MEMORY_TIERS.includes(manifest.memory_tier)) {
    errors.push(
      `memory_tier '${manifest.memory_tier}' is not valid; allowed: ${VALID_MEMORY_TIERS.join(', ')}`
    );
  }
}

function validateCostEnvelope(manifest, errors) {
  if (manifest.cost_envelope === undefined || manifest.cost_envelope === null) {
    errors.push('cost_envelope is required');
    return;
  }
  if (typeof manifest.cost_envelope !== 'object' || Array.isArray(manifest.cost_envelope)) {
    errors.push('cost_envelope must be an object');
    return;
  }
  const ce = manifest.cost_envelope;

  if (ce.max_tokens_per_task === undefined || ce.max_tokens_per_task === null) {
    errors.push('cost_envelope.max_tokens_per_task is required');
  } else if (
    typeof ce.max_tokens_per_task !== 'number' ||
    ce.max_tokens_per_task < TOKENS_MIN ||
    ce.max_tokens_per_task > TOKENS_MAX
  ) {
    errors.push(
      `cost_envelope.max_tokens_per_task must be an integer between ${TOKENS_MIN} and ${TOKENS_MAX}, got ${ce.max_tokens_per_task}`
    );
  }

  if (ce.max_usd_per_session === undefined || ce.max_usd_per_session === null) {
    errors.push('cost_envelope.max_usd_per_session is required');
  } else if (typeof ce.max_usd_per_session !== 'number' || ce.max_usd_per_session < USD_MIN) {
    errors.push(
      `cost_envelope.max_usd_per_session must be a number >= ${USD_MIN}, got ${ce.max_usd_per_session}`
    );
  }

  if (ce.preferred_model === undefined || ce.preferred_model === null) {
    errors.push('cost_envelope.preferred_model is required');
  } else if (!VALID_PREFERRED_MODELS.includes(ce.preferred_model)) {
    errors.push(
      `cost_envelope.preferred_model '${ce.preferred_model}' is not valid; allowed: ${VALID_PREFERRED_MODELS.join(', ')}`
    );
  }
}

function validateSessionType(manifest, errors) {
  if (manifest.session_type === undefined || manifest.session_type === null) {
    errors.push('session_type is required');
  } else if (!VALID_SESSION_TYPES.includes(manifest.session_type)) {
    errors.push(
      `session_type '${manifest.session_type}' is not valid; allowed: ${VALID_SESSION_TYPES.join(', ')}`
    );
  }
}

function validateA2aInterop(manifest, errors) {
  if (manifest.a2a_interop === undefined || manifest.a2a_interop === null) {
    errors.push('a2a_interop is required');
    return;
  }
  if (typeof manifest.a2a_interop !== 'object' || Array.isArray(manifest.a2a_interop)) {
    errors.push('a2a_interop must be an object');
    return;
  }
  const a2a = manifest.a2a_interop;

  for (const key of ['supports_mcp', 'supports_aip_tokens', 'supports_maf']) {
    if (a2a[key] === undefined || a2a[key] === null) {
      errors.push(`a2a_interop.${key} is required`);
    } else if (typeof a2a[key] !== 'boolean') {
      errors.push(`a2a_interop.${key} must be a boolean`);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * validateManifest(manifest, opts?)
 *
 * Validates a plain manifest object against the v3.0.0 schema.
 *
 * @param {object} manifest - The manifest object to validate.
 * @param {object} [_opts] - Options (reserved for future use).
 * @returns {{ valid: boolean, errors: string[], upgradeHint?: string }}
 */
function validateManifest(manifest, _opts = {}) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    errors.push('manifest must be a non-null object');
    return { valid: false, errors };
  }

  const upgradeHint = validateManifestVersion(manifest, errors);
  validateAgentId(manifest, errors);
  validateAgentType(manifest, errors);
  validateCapabilities(manifest, errors);
  validateMemoryTier(manifest, errors);
  validateCostEnvelope(manifest, errors);
  validateSessionType(manifest, errors);
  validateA2aInterop(manifest, errors);

  const valid = errors.length === 0;
  const result = { valid, errors };
  if (upgradeHint !== undefined) {
    result.upgradeHint = upgradeHint;
  }
  return result;
}

/**
 * loadManifest(manifest, opts?)
 *
 * Validates and returns a manifest object.
 *
 * BC-2 enforcement in strict mode:
 *   - null/undefined/empty-object → throws ManifestStartupError
 *   - invalid manifest → throws ManifestStartupError
 *
 * Non-strict mode (opts.strict === false):
 *   - null/undefined/invalid → returns null (no throw)
 *
 * @param {object|null|undefined} manifest - The manifest to load.
 * @param {{ strict?: boolean }} [opts] - Options. Defaults to { strict: true }.
 * @returns {object} The validated manifest object.
 * @throws {ManifestStartupError} In strict mode when manifest is absent or invalid.
 */
function loadManifest(manifest, opts = {}) {
  const strict = opts.strict !== false;

  const isAbsent =
    manifest === null ||
    manifest === undefined ||
    (typeof manifest === 'object' &&
      !Array.isArray(manifest) &&
      Object.keys(manifest).length === 0);

  if (isAbsent) {
    if (!strict) return null;
    const agentId = (manifest && manifest.agent_id) || '<unknown>';
    throw new ManifestStartupError(
      `BC-2: agent manifest required in v3.0.0 for agent '${agentId}'; run pnpm migrate:2x-to-3`
    );
  }

  const result = validateManifest(manifest);

  if (!result.valid) {
    if (!strict) return null;
    const agentId =
      manifest && typeof manifest === 'object' && manifest.agent_id
        ? manifest.agent_id
        : '<unknown>';
    throw new ManifestStartupError(
      `BC-2: agent manifest required in v3.0.0 for agent '${agentId}'; run pnpm migrate:2x-to-3. Errors: ${result.errors.join(' | ')}`
    );
  }

  return manifest;
}

module.exports = {
  MANIFEST_VERSION,
  ManifestStartupError,
  validateManifest,
  loadManifest,
};
