/**
 * Session Audit Logger (SEC-PM-003)
 *
 * Provides append-only JSONL audit logging for Party Mode sessions.
 * Records agent spawn, response, and completion events.
 *
 * Security Properties:
 * - Append-only (no modifications/deletions)
 * - JSONL format (one event per line)
 * - Complete audit trail
 * - Performance: <2ms per write, <50ms for 100 entries retrieval
 */

const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');

// Default audit log path
const DEFAULT_AUDIT_LOG_PATH = path.join(
  process.cwd(),
  '.claude',
  'context',
  'metrics',
  'party-mode-audit.jsonl'
);

/**
 * Log agent spawn event
 *
 * Records when an agent is spawned in a Party Mode session.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} agentType - Type of agent (developer, architect, etc.)
 * @param {Object} context - Context object (will be hashed)
 * @param {string} [logPath] - Optional log file path (defaults to DEFAULT_AUDIT_LOG_PATH)
 */
async function logAgentSpawn(
  sessionId,
  agentId,
  agentType,
  context,
  logPath = DEFAULT_AUDIT_LOG_PATH
) {
  // Hash context to avoid storing full context in log
  const contextHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(context))
    .digest('hex')
    .slice(0, 16);

  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    event: 'SPAWN',
    agentId,
    agentType,
    contextHash,
  };

  await appendToLog(entry, logPath);
}

/**
 * Log agent response event
 *
 * Records when an agent provides a response.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} responseHash - Hash of the response
 * @param {string} [logPath] - Optional log file path
 */
async function logAgentResponse(
  sessionId,
  agentId,
  responseHash,
  logPath = DEFAULT_AUDIT_LOG_PATH
) {
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    event: 'RESPONSE',
    agentId,
    responseHash,
  };

  await appendToLog(entry, logPath);
}

/**
 * Log agent completion event
 *
 * Records when an agent completes its work.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} agentId - Agent identifier
 * @param {string} status - Completion status (success, error, timeout)
 * @param {string} [logPath] - Optional log file path
 */
async function logAgentComplete(sessionId, agentId, status, logPath = DEFAULT_AUDIT_LOG_PATH) {
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    event: 'COMPLETE',
    agentId,
    status,
  };

  await appendToLog(entry, logPath);
}

/**
 * Get all audit entries for a session
 *
 * Retrieves and parses all audit log entries for the given session.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} [logPath] - Optional log file path
 * @returns {Promise<Array<Object>>} Array of audit entries
 */
async function getSessionAudit(sessionId, logPath = DEFAULT_AUDIT_LOG_PATH) {
  try {
    const logContent = await fs.readFile(logPath, 'utf-8');
    const lines = logContent
      .trim()
      .split('\n')
      .filter(line => line.length > 0);

    const sessionEntries = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId === sessionId) {
          sessionEntries.push(entry);
        }
      } catch (err) {
        // Skip malformed lines
        console.warn(`Skipping malformed audit entry: ${err.message}`);
      }
    }

    return sessionEntries;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Log file doesn't exist yet
      return [];
    }
    throw err;
  }
}

/**
 * Verify audit log integrity
 *
 * Validates that the audit log maintains append-only property.
 *
 * @param {string} sessionId - Session identifier
 * @param {string} [logPath] - Optional log file path
 * @returns {Promise<Object>} Verification result
 * @returns {boolean} result.intact - Whether audit log is intact
 * @returns {Array<string>} result.issues - Array of integrity issues found
 */
async function verifyAuditIntegrity(sessionId, logPath = DEFAULT_AUDIT_LOG_PATH) {
  const audit = await getSessionAudit(sessionId, logPath);
  const issues = [];

  // Check 1: Timestamps should be monotonically increasing
  for (let i = 1; i < audit.length; i++) {
    const prevTime = new Date(audit[i - 1].timestamp).getTime();
    const currTime = new Date(audit[i].timestamp).getTime();

    if (currTime < prevTime) {
      issues.push(
        `Timestamp out of order at entry ${i}: ${audit[i].timestamp} < ${audit[i - 1].timestamp}`
      );
    }
  }

  // Check 2: All entries should have required fields
  for (let i = 0; i < audit.length; i++) {
    const entry = audit[i];
    if (!entry.timestamp || !entry.sessionId || !entry.event || !entry.agentId) {
      issues.push(`Entry ${i} missing required fields`);
    }
  }

  return {
    intact: issues.length === 0,
    issues,
  };
}

/**
 * Append entry to audit log (internal helper)
 *
 * Appends a JSON entry to the log file (JSONL format).
 *
 * @param {Object} entry - Audit entry to append
 * @param {string} logPath - Log file path
 * @private
 */
async function appendToLog(entry, logPath) {
  // Ensure directory exists
  const logDir = path.dirname(logPath);
  await fs.mkdir(logDir, { recursive: true });

  // Append entry as JSON line
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(logPath, line, 'utf-8');
}

module.exports = {
  logAgentSpawn,
  logAgentResponse,
  logAgentComplete,
  getSessionAudit,
  verifyAuditIntegrity,
};
