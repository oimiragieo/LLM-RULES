/**
 * Message Router (Core Protocol Component)
 *
 * Provides fast message routing between agents (<5ms).
 * Messages are stored in router state, agents pull from history.
 *
 * Performance Targets:
 * - Message routing: <5ms
 * - Registration: <1ms
 * - History retrieval: <2ms
 */

const crypto = require('crypto');

/**
 * Create message router for session
 *
 * Initializes routing table and message queue for a Party Mode session.
 *
 * @param {string} sessionId - Unique session identifier
 * @returns {Object} Router state
 * @returns {string} result.sessionId - Session ID
 * @returns {Map} result.routes - Agent routing table (agentId -> agent metadata)
 * @returns {Array} result.messageQueue - Queue of all messages
 */
function createRouter(sessionId) {
  return {
    sessionId,
    routes: new Map(),
    messageQueue: [],
  };
}

/**
 * Register agent in router
 *
 * Adds agent to routing table with unique route ID.
 *
 * @param {Object} router - Router state
 * @param {string} agentId - Agent identifier
 * @param {string} agentType - Agent type (developer, architect, etc.)
 * @returns {Object} Registration result
 * @returns {boolean} result.success - Whether registration succeeded
 * @returns {string} [result.routeId] - Unique route ID (on success)
 * @returns {string} [result.error] - Error message (on failure)
 */
function registerAgent(router, agentId, agentType) {
  // Check if already registered
  if (router.routes.has(agentId)) {
    return {
      success: false,
      error: `Agent ${agentId} is already registered`,
    };
  }

  // Generate route ID
  const routeId = `route_${crypto.randomBytes(8).toString('hex')}`;

  // Register agent
  router.routes.set(agentId, {
    agentId,
    agentType,
    routeId,
    registeredAt: Date.now(),
  });

  return {
    success: true,
    routeId,
  };
}

/**
 * Route message from one agent to another
 *
 * Delivers message and records in message queue.
 *
 * @param {Object} router - Router state
 * @param {string} fromAgentId - Sender agent ID
 * @param {string} toAgentId - Recipient agent ID
 * @param {Object} message - Message object
 * @returns {Object} Routing result
 * @returns {boolean} result.delivered - Whether message was delivered
 * @returns {number} result.timestamp - Delivery timestamp (ms)
 * @returns {string} result.messageHash - Message hash for integrity
 * @returns {string} [result.error] - Error message (on failure)
 */
function routeMessage(router, fromAgentId, toAgentId, message) {
  // Verify sender is registered
  if (!router.routes.has(fromAgentId)) {
    return {
      delivered: false,
      error: `Sender ${fromAgentId} not registered`,
    };
  }

  // Verify recipient is registered
  if (!router.routes.has(toAgentId)) {
    return {
      delivered: false,
      error: `Recipient ${toAgentId} not registered`,
    };
  }

  // Create message entry
  const timestamp = Date.now();
  const messageHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ fromAgentId, toAgentId, message, timestamp }))
    .digest('hex')
    .slice(0, 16);

  const messageEntry = {
    fromAgentId,
    toAgentId,
    message,
    timestamp,
    messageHash,
    type: 'unicast',
  };

  // Add to message queue
  router.messageQueue.push(messageEntry);

  return {
    delivered: true,
    timestamp,
    messageHash,
  };
}

/**
 * Broadcast message to all agents except sender
 *
 * Sends message to all registered agents (excluding sender).
 *
 * @param {Object} router - Router state
 * @param {string} fromAgentId - Sender agent ID
 * @param {Object} message - Message object
 * @returns {Object} Broadcast result
 * @returns {number} result.delivered - Number of agents message was delivered to
 * @returns {Array<string>} result.failedAgents - Array of agent IDs that failed to receive
 */
function broadcastMessage(router, fromAgentId, message) {
  const failedAgents = [];
  let deliveredCount = 0;

  // Get all agents except sender
  const recipients = Array.from(router.routes.keys()).filter(agentId => agentId !== fromAgentId);

  // Send to each recipient
  for (const toAgentId of recipients) {
    const result = routeMessage(router, fromAgentId, toAgentId, message);

    if (result.delivered) {
      deliveredCount++;
    } else {
      failedAgents.push(toAgentId);
    }
  }

  return {
    delivered: deliveredCount,
    failedAgents,
  };
}

/**
 * Get message history for agent
 *
 * Retrieves all messages sent by or received by the agent.
 *
 * @param {Object} router - Router state
 * @param {string} agentId - Agent identifier
 * @returns {Array<Object>} Array of messages (sent + received)
 */
function getMessageHistory(router, agentId) {
  return router.messageQueue.filter(
    msg => msg.fromAgentId === agentId || msg.toAgentId === agentId
  );
}

module.exports = {
  createRouter,
  registerAgent,
  routeMessage,
  broadcastMessage,
  getMessageHistory,
};
