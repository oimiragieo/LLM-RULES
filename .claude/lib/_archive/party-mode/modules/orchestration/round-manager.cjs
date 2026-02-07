/**
 * Round Manager
 *
 * Manages Party Mode sessions and round coordination.
 * Enforces SEC-PM-005 rate limiting:
 * - 4 agents max per round (prevents agent spawn bombs)
 * - 10 rounds max per session (prevents session exhaustion)
 *
 * Session States:
 * - Round 0: Initialized, no rounds started
 * - Round 1-10: Active rounds
 * - Round > 10: Rejected (rate limit)
 *
 * Performance Targets:
 * - Session init: <20ms
 * - Round start/complete: <5ms
 */

// In-memory session state (session-scoped)
const sessionState = new Map();

// Rate limits (SEC-PM-005)
const MAX_AGENTS_PER_ROUND = 4;
const MAX_ROUNDS_PER_SESSION = 10;

/**
 * Initialize Party Mode session
 *
 * Creates session state with team configuration.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} teamName - Team name (default, creative, technical)
 * @returns {Promise<Object>} Session state
 * @returns {string} state.sessionId - Session identifier
 * @returns {string} state.teamName - Team name
 * @returns {number} state.round - Current round (0 initially)
 * @returns {number} state.maxRounds - Max rounds allowed (10)
 * @returns {number} state.startedAt - Session start timestamp
 */
async function initializeSession(sessionId, teamName) {
  const timestamp = Date.now();

  const state = {
    sessionId,
    teamName,
    round: 0,
    maxRounds: MAX_ROUNDS_PER_SESSION,
    startedAt: timestamp,
    rounds: [], // History of all rounds
  };

  sessionState.set(sessionId, state);

  return {
    sessionId: state.sessionId,
    teamName: state.teamName,
    round: state.round,
    maxRounds: state.maxRounds,
    startedAt: state.startedAt,
  };
}

/**
 * Start new collaboration round
 *
 * Increments round counter and validates rate limits.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Round state
 * @returns {string} state.sessionId - Session identifier
 * @returns {number} state.round - Current round number
 * @returns {number} state.agentsActive - Agents active in round (0 initially)
 * @throws {Error} If round limit exceeded
 */
async function startRound(sessionId) {
  const session = sessionState.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Check round limit (SEC-PM-005)
  if (session.round >= MAX_ROUNDS_PER_SESSION) {
    throw new Error(
      `Round limit of ${MAX_ROUNDS_PER_SESSION} rounds exceeded for session ${sessionId}`
    );
  }

  // Increment round counter
  session.round += 1;

  // Initialize round state
  const roundState = {
    roundNumber: session.round,
    startedAt: Date.now(),
    agentsActive: 0,
    completed: false,
  };

  session.rounds.push(roundState);
  sessionState.set(sessionId, session);

  return {
    sessionId,
    round: session.round,
    agentsActive: roundState.agentsActive,
  };
}

/**
 * Complete current round
 *
 * Marks round as completed and records completion time.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Completion result
 * @returns {string} result.sessionId - Session identifier
 * @returns {number} result.round - Round number
 * @returns {boolean} result.completed - Whether completed
 * @returns {number} result.completedAt - Completion timestamp
 */
async function completeRound(sessionId) {
  const session = sessionState.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.round === 0) {
    throw new Error(`No active round to complete for session ${sessionId}`);
  }

  // Get current round state
  const currentRoundIndex = session.round - 1;
  const roundState = session.rounds[currentRoundIndex];

  // Mark as completed
  roundState.completed = true;
  roundState.completedAt = Date.now();

  sessionState.set(sessionId, session);

  return {
    sessionId,
    round: session.round,
    completed: true,
    completedAt: roundState.completedAt,
  };
}

/**
 * Get current round status
 *
 * Returns state of current round.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Round status
 * @returns {string} status.sessionId - Session identifier
 * @returns {number} status.round - Current round number
 * @returns {number} status.agentsActive - Agents active in round
 * @returns {boolean} status.completed - Whether round is completed
 */
async function getRoundStatus(sessionId) {
  const session = sessionState.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.round === 0) {
    return {
      sessionId,
      round: 0,
      agentsActive: 0,
      completed: false,
    };
  }

  // Get current round state
  const currentRoundIndex = session.round - 1;
  const roundState = session.rounds[currentRoundIndex];

  return {
    sessionId,
    round: session.round,
    agentsActive: roundState.agentsActive,
    completed: roundState.completed,
  };
}

/**
 * Enforce rate limits (SEC-PM-005)
 *
 * Validates agent count and round count against limits.
 *
 * Rate Limits:
 * - 4 agents max per round
 * - 10 rounds max per session
 *
 * @param {string} sessionId - Session identifier
 * @param {number} agentCount - Proposed agent count
 * @returns {Promise<Object>} Rate limit result
 * @returns {boolean} result.allowed - Whether allowed
 * @returns {string} [result.reason] - Reason for rejection
 */
async function enforceRateLimits(sessionId, agentCount) {
  const session = sessionState.get(sessionId);

  if (!session) {
    return {
      allowed: false,
      reason: `Session ${sessionId} not found`,
    };
  }

  // Check 1: Agent count per round (SEC-PM-005)
  if (agentCount > MAX_AGENTS_PER_ROUND) {
    return {
      allowed: false,
      reason: `Agent limit of ${MAX_AGENTS_PER_ROUND} agents per round exceeded (requested: ${agentCount})`,
    };
  }

  // Check 2: Round count per session (SEC-PM-005)
  if (session.round >= MAX_ROUNDS_PER_SESSION) {
    return {
      allowed: false,
      reason: `Round limit of ${MAX_ROUNDS_PER_SESSION} rounds per session exceeded (current: ${session.round})`,
    };
  }

  // All checks passed
  return {
    allowed: true,
  };
}

module.exports = {
  initializeSession,
  startRound,
  completeRound,
  getRoundStatus,
  enforceRateLimits,
};
