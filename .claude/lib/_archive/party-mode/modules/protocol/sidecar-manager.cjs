/**
 * Sidecar Memory Manager (SEC-PM-006)
 *
 * Manages isolated per-agent memory (sidecars).
 * Each agent has private directory for discoveries, keyFiles, notes.
 *
 * Security Properties:
 * - One sidecar per agent (isolated filesystem)
 * - Access control (agent only reads/writes own sidecar)
 * - Path validation (prevent traversal attacks)
 * - Performance: <5ms read/write, <50ms creation
 */

const fs = require('fs/promises');
const path = require('path');
const { validatePathSafety } = require('../../utils/path-validator.cjs');

// Base path for all sidecars
const SIDECAR_BASE_PATH = path.join(process.cwd(), '.claude', 'staging', 'agents');

/**
 * Create sidecar directory for agent
 *
 * Initializes private memory directory with default files.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} agentType - Agent type (developer, architect, etc.)
 * @returns {Promise<Object>} Creation result
 * @returns {string} result.sidecarPath - Path to sidecar directory
 * @returns {boolean} result.initialized - Whether initialization succeeded
 */
async function createSidecar(sessionId, agentId, _agentType) {
  const sidecarPath = path.join(SIDECAR_BASE_PATH, sessionId, agentId);

  // Create directory
  await fs.mkdir(sidecarPath, { recursive: true });

  // Initialize default files
  const discoveryPath = path.join(sidecarPath, 'discoveries.json');
  const keyFilesPath = path.join(sidecarPath, 'keyFiles.json');
  const notesPath = path.join(sidecarPath, 'notes.txt');

  await fs.writeFile(discoveryPath, JSON.stringify([], null, 2), 'utf-8');
  await fs.writeFile(keyFilesPath, JSON.stringify([], null, 2), 'utf-8');
  await fs.writeFile(notesPath, '# Agent Notes\n\n', 'utf-8');

  return {
    sidecarPath,
    initialized: true,
  };
}

/**
 * Write key-value to agent sidecar
 *
 * Stores data in <agentId>/<key>.json file.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} key - Data key
 * @param {*} value - Data value (will be JSON serialized)
 * @returns {Promise<Object>} Write result
 * @returns {boolean} result.written - Whether write succeeded
 * @returns {string} [result.path] - Path where data was written
 * @returns {string} [result.error] - Error message (on failure)
 */
async function writeSidecar(sessionId, agentId, key, value) {
  // Validate key doesn't contain path traversal
  const pathCheck = validatePathSafety(key);
  if (!pathCheck.valid) {
    return {
      written: false,
      error: `Invalid key path: ${pathCheck.reason}`,
    };
  }

  const sidecarPath = path.join(SIDECAR_BASE_PATH, sessionId, agentId);
  const keyPath = path.join(sidecarPath, `${key}.json`);

  // Verify sidecar exists
  try {
    await fs.access(sidecarPath);
  } catch (_err) {
    return {
      written: false,
      error: `Sidecar does not exist for agent ${agentId}`,
    };
  }

  // Write value
  try {
    await fs.writeFile(keyPath, JSON.stringify(value, null, 2), 'utf-8');

    return {
      written: true,
      path: keyPath,
    };
  } catch (err) {
    return {
      written: false,
      error: err.message,
    };
  }
}

/**
 * Read key-value from agent sidecar
 *
 * Retrieves data from <agentId>/<key>.json file.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} key - Data key
 * @returns {Promise<Object>} Read result
 * @returns {*} result.value - Data value (or null if not found)
 * @returns {number} result.timestamp - Read timestamp
 */
async function readSidecar(sessionId, agentId, key) {
  const sidecarPath = path.join(SIDECAR_BASE_PATH, sessionId, agentId);
  const keyPath = path.join(sidecarPath, `${key}.json`);

  try {
    const content = await fs.readFile(keyPath, 'utf-8');
    const value = JSON.parse(content);

    return {
      value,
      timestamp: Date.now(),
    };
  } catch (_err) {
    // File doesn't exist or parse error
    return {
      value: null,
      timestamp: Date.now(),
    };
  }
}

/**
 * List all keys in agent sidecar
 *
 * Returns array of all key names (without .json extension).
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @returns {Promise<Array<string>>} Array of key names
 */
async function listSidecarKeys(sessionId, agentId) {
  const sidecarPath = path.join(SIDECAR_BASE_PATH, sessionId, agentId);

  try {
    const files = await fs.readdir(sidecarPath);

    // Filter .json files and remove extension
    const keys = files
      .filter(file => file.endsWith('.json'))
      .filter(file => !['discoveries.json', 'keyFiles.json'].includes(file)) // Exclude default files
      .map(file => file.replace('.json', ''));

    return keys;
  } catch (_err) {
    // Directory doesn't exist
    return [];
  }
}

/**
 * Validate sidecar access permissions
 *
 * Verifies agent is only accessing its OWN sidecar.
 *
 * @param {string} requestingAgentId - Agent making the request
 * @param {string} targetAgentId - Target sidecar agent ID
 * @returns {Object} Validation result
 * @returns {boolean} result.allowed - Whether access is allowed
 * @returns {string} [result.reason] - Reason (on denial)
 */
function validateSidecarAccess(requestingAgentId, targetAgentId) {
  if (requestingAgentId === targetAgentId) {
    return {
      allowed: true,
    };
  }

  return {
    allowed: false,
    reason: `Agent ${requestingAgentId} is not allowed to access sidecar of ${targetAgentId}`,
  };
}

module.exports = {
  createSidecar,
  writeSidecar,
  readSidecar,
  listSidecarKeys,
  validateSidecarAccess,
};
