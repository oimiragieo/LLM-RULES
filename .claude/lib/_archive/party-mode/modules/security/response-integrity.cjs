/**
 * Response Integrity Validator (SEC-PM-002)
 *
 * Provides hash chain integrity for Party Mode responses.
 * Each response includes hash of (content + previous hash).
 * Creates tamper-evident blockchain-like chain.
 *
 * Security Properties:
 * - Hash chaining (tamper detection)
 * - Complete audit trail
 * - Content integrity verification
 * - Performance: <2ms per append, <10ms for 10-response chain
 */

const crypto = require('crypto');

/**
 * Initialize response chain for a session
 *
 * Creates genesis block with unique hash for session.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Object} Genesis block
 * @returns {string} result.sessionId - Session ID
 * @returns {string} result.genesisHash - Genesis hash
 * @returns {string} result.timestamp - ISO timestamp
 */
function initializeChain(sessionId) {
  // Generate genesis hash from session ID and timestamp
  const timestamp = new Date().toISOString();
  const input = `genesis:${sessionId}:${timestamp}`;
  const genesisHash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);

  return {
    sessionId,
    genesisHash,
    timestamp,
  };
}

/**
 * Append response to hash chain
 *
 * Creates hash of (agentId + content + previousHash + timestamp).
 *
 * @param {string} agentId - Agent identifier
 * @param {Object} response - Response object
 * @param {string} previousHash - Previous response hash (or '0' for first)
 * @returns {Object} Chain entry
 * @returns {string} result.responseHash - Hash of this response
 * @returns {string} result.agentId - Agent identifier
 * @returns {string} result.timestamp - ISO timestamp
 * @returns {string} result.previousHash - Previous hash
 * @returns {Object} result.content - Response content
 */
function appendResponse(agentId, response, previousHash) {
  const timestamp = new Date().toISOString();
  const content = response.content || JSON.stringify(response);

  // Build hash input: previousHash + agentId + content + timestamp
  const input = `${previousHash}:${agentId}:${content}:${timestamp}`;
  const responseHash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);

  return {
    responseHash,
    agentId,
    timestamp,
    previousHash,
    content,
  };
}

/**
 * Verify entire response chain
 *
 * Validates that chain is intact and no responses were tampered with.
 *
 * @param {Array<Object>} responseChain - Array of response objects
 * @returns {Object} Verification result
 * @returns {boolean} result.valid - Whether chain is valid
 * @returns {number|null} result.brokenAtIndex - Index where chain breaks (or null)
 */
function verifyChain(responseChain) {
  if (!responseChain || responseChain.length === 0) {
    return { valid: true, brokenAtIndex: null };
  }

  let expectedPreviousHash = '0';

  for (let i = 0; i < responseChain.length; i++) {
    const response = responseChain[i];

    // Check previous hash matches expected
    if (response.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAtIndex: i,
      };
    }

    // Recalculate hash from response data
    const input = `${response.previousHash}:${response.agentId}:${response.content}:${response.timestamp}`;
    const calculatedHash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);

    // Check hash matches stored hash
    if (calculatedHash !== response.responseHash) {
      return {
        valid: false,
        brokenAtIndex: i,
      };
    }

    // Update expected previous hash for next iteration
    expectedPreviousHash = response.responseHash;
  }

  return { valid: true, brokenAtIndex: null };
}

/**
 * Detect if response was tampered with
 *
 * Compares expected hash with recalculated hash from response.
 * Note: This is a utility function - full verification uses verifyChain.
 *
 * @param {string} expectedHash - Expected response hash
 * @param {Object} actualResponse - Actual response object (must include content)
 * @returns {Object} Detection result
 * @returns {boolean} result.tampered - Whether response was tampered
 * @returns {string} result.expectedHash - Expected hash
 * @returns {string} result.actualHash - Actual hash (if calculable)
 */
function detectTampering(expectedHash, actualResponse) {
  // For simple comparison, just check if expected matches
  // In practice, we'd need the full chain context
  const content = actualResponse.content || JSON.stringify(actualResponse);

  // If response has all needed fields, recalculate hash
  if (actualResponse.previousHash && actualResponse.agentId && actualResponse.timestamp) {
    const input = `${actualResponse.previousHash}:${actualResponse.agentId}:${content}:${actualResponse.timestamp}`;
    const actualHash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);

    return {
      tampered: expectedHash !== actualHash,
      expectedHash,
      actualHash,
    };
  }

  // Without full context, just compare content hash
  const simpleHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  return {
    tampered: expectedHash !== simpleHash,
    expectedHash,
    actualHash: simpleHash,
  };
}

module.exports = {
  initializeChain,
  appendResponse,
  verifyChain,
  detectTampering,
};
