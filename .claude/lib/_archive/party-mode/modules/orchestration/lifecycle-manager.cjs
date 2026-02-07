/**
 * Lifecycle Manager
 *
 * Manages agent lifecycle (spawn → active → completing → completed).
 * Integrates Phase 1 (agent-identity) and Phase 2 (context-isolator, sidecar-manager).
 *
 * Lifecycle States:
 * - spawned: Agent created, not yet active
 * - active: Agent actively working
 * - completing: Agent finishing work
 * - completed: Agent done (success)
 * - failed: Agent errored out
 * - terminated: Agent force-stopped
 *
 * Performance Targets:
 * - Agent spawn: <100ms (including security checks)
 */

const { generateAgentId } = require('../security/agent-identity.cjs');
const { isolateContext } = require('../protocol/context-isolator.cjs');
const { createSidecar } = require('../protocol/sidecar-manager.cjs');

// In-memory lifecycle state (session-scoped)
const lifecycleState = new Map();

/**
 * Spawn agent with isolated context and sidecar
 *
 * Steps:
 * 1. Generate agent ID (agent-identity.cjs)
 * 2. Isolate context (context-isolator.cjs)
 * 3. Create sidecar (sidecar-manager.cjs)
 * 4. Track lifecycle state
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentType - Agent type (developer, architect, etc.)
 * @param {string} role - Agent role (implementer, reviewer, validator, coordinator)
 * @param {Object} sharedContext - Shared context to isolate
 * @returns {Promise<Object>} Spawn result
 * @returns {string} result.agentId - Generated agent ID
 * @returns {string} result.status - Initial status (spawned)
 * @returns {number} result.timestamp - Spawn timestamp
 * @returns {Object} result.isolatedContext - Isolated context for agent
 */
async function spawnAgent(sessionId, agentType, role, sharedContext) {
  const spawnTime = Date.now();

  // STEP 1: Generate unique agent ID (SEC-PM-001)
  const agentId = generateAgentId(agentType, spawnTime, sessionId);

  // STEP 2: Isolate context (SEC-PM-004)
  const isolatedContext = isolateContext(sharedContext, agentId, agentType);

  // STEP 3: Create sidecar (SEC-PM-006)
  const { sidecarPath } = await createSidecar(sessionId, agentId, agentType);

  // STEP 4: Track lifecycle state
  lifecycleState.set(agentId, {
    agentId,
    sessionId,
    agentType,
    role,
    status: 'spawned',
    spawnedAt: spawnTime,
    updatedAt: spawnTime,
    sidecarPath,
    statusHistory: [{ status: 'spawned', timestamp: spawnTime }],
  });

  return {
    agentId,
    status: 'spawned',
    timestamp: spawnTime,
    isolatedContext,
  };
}

/**
 * Update agent lifecycle status
 *
 * Valid transitions:
 * - spawned → active
 * - active → completing
 * - completing → completed
 * - any → failed
 * - any → terminated
 *
 * @param {string} agentId - Agent identifier
 * @param {string} newStatus - New status
 * @returns {Promise<Object>} Update result
 * @returns {boolean} result.updated - Whether update succeeded
 * @returns {string} result.agentId - Agent identifier
 * @returns {string} result.previousStatus - Previous status
 * @returns {string} result.newStatus - New status
 */
async function updateAgentStatus(agentId, newStatus) {
  const agent = lifecycleState.get(agentId);

  if (!agent) {
    return {
      updated: false,
      error: `Agent ${agentId} not found in lifecycle state`,
    };
  }

  const previousStatus = agent.status;
  const timestamp = Date.now();

  // Update state
  agent.status = newStatus;
  agent.updatedAt = timestamp;
  agent.statusHistory.push({ status: newStatus, timestamp });

  lifecycleState.set(agentId, agent);

  return {
    updated: true,
    agentId,
    previousStatus,
    newStatus,
  };
}

/**
 * Get agent status
 *
 * @param {string} agentId - Agent identifier
 * @returns {Promise<Object|null>} Agent status or null if not found
 * @returns {string} status.agentId - Agent identifier
 * @returns {string} status.agentType - Agent type
 * @returns {string} status.role - Agent role
 * @returns {string} status.status - Current status
 * @returns {number} status.spawnedAt - Spawn timestamp
 * @returns {number} status.updatedAt - Last update timestamp
 */
async function getAgentStatus(agentId) {
  const agent = lifecycleState.get(agentId);

  if (!agent) {
    return null;
  }

  return {
    agentId: agent.agentId,
    agentType: agent.agentType,
    role: agent.role,
    status: agent.status,
    spawnedAt: agent.spawnedAt,
    updatedAt: agent.updatedAt,
  };
}

/**
 * Terminate agent gracefully
 *
 * Steps:
 * 1. Update status to 'terminated'
 * 2. Preserve sidecar for audit
 *
 * @param {string} agentId - Agent identifier
 * @param {string} reason - Termination reason
 * @returns {Promise<Object>} Termination result
 * @returns {boolean} result.terminated - Whether termination succeeded
 * @returns {string} result.agentId - Agent identifier
 */
async function terminateAgent(agentId, reason) {
  const agent = lifecycleState.get(agentId);

  if (!agent) {
    return {
      terminated: false,
      error: `Agent ${agentId} not found`,
    };
  }

  // Update status to terminated
  await updateAgentStatus(agentId, 'terminated');

  // Add termination reason
  agent.terminationReason = reason;
  agent.terminatedAt = Date.now();

  lifecycleState.set(agentId, agent);

  // Note: Sidecar is preserved for audit (not deleted)

  return {
    terminated: true,
    agentId,
  };
}

/**
 * Get all agents in session
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Array<Object>>} Array of agent states
 * @returns {string} agent.agentId - Agent identifier
 * @returns {string} agent.agentType - Agent type
 * @returns {string} agent.role - Agent role
 * @returns {string} agent.status - Current status
 * @returns {number} agent.timestamp - Spawn timestamp
 */
async function getAllAgents(sessionId) {
  const agents = [];

  for (const [_agentId, agent] of lifecycleState.entries()) {
    if (agent.sessionId === sessionId) {
      agents.push({
        agentId: agent.agentId,
        agentType: agent.agentType,
        role: agent.role,
        status: agent.status,
        timestamp: agent.spawnedAt,
      });
    }
  }

  return agents;
}

module.exports = {
  spawnAgent,
  updateAgentStatus,
  getAgentStatus,
  terminateAgent,
  getAllAgents,
};
