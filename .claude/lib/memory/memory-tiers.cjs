#!/usr/bin/env node
/**
 * Memory Tiers - STM/MTM/LTM Implementation
 * ==========================================
 *
 * Implements a three-tier memory hierarchy based on research findings:
 * - STM (Short-Term Memory): Current session context, session-bound
 * - MTM (Mid-Term Memory): Recent sessions (last 10), detailed retention
 * - LTM (Long-Term Memory): Permanent knowledge, compressed summaries
 *
 * Based on research report: memory-system-research.md
 * Key patterns:
 * - Hierarchical Memory Architecture (MemoryOS, H-MEM)
 * - Rolling Summary Compression (Factory.ai pattern)
 * - Utility-based pruning for overflow handling
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { withLock } = require('../utils/file-locker.cjs');
const {
  isStructuredSummaryEnabled,
  isSessionArchiveEnabled,
  writeSessionArchive,
  buildUniqueTimestampToken,
  appendTierEvent: appendTierEventBase,
} = require('./memory-tier-helpers.cjs');

// BUG-001 Fix: Import findProjectRoot to prevent nested .claude folder creation
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// Configuration
const CONFIG = {
  MTM_MAX_SESSIONS: 10,
  MTM_WARN_THRESHOLD: 8, // Warn when approaching limit
  SUMMARY_MIN_SESSIONS: 5, // Minimum sessions to summarize
};

/**
 * Get the path used as a lock sentinel for tier operations.
 * The lock file is placed in the runtime directory to avoid
 * cluttering the memory tier directories themselves.
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root
 * @returns {string} Absolute path to the lock sentinel file
 */
function getLockFilePath(projectRoot = PROJECT_ROOT) {
  const runtimeDir = path.join(projectRoot, '.claude', 'context', 'runtime');
  if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
  const lockSentinel = path.join(runtimeDir, 'memory-tiers.lock');
  // Ensure sentinel file exists (proper-lockfile requires it)
  if (!fs.existsSync(lockSentinel)) fs.writeFileSync(lockSentinel, '');
  return lockSentinel;
}

/**
 * Execute a function while holding the memory-tiers file lock.
 * This serializes concurrent tier operations to prevent data corruption
 * during read-modify-write cycles on MTM/LTM directories.
 *
 * Graceful degradation: if locking fails (e.g., stale lock, permissions),
 * the function executes without the lock and logs a warning to stderr.
 *
 * @param {Function} fn - Async function to execute under lock
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root
 * @returns {Promise<any>} Result of fn()
 */
async function withFileLock(fn, projectRoot = PROJECT_ROOT) {
  const lockPath = getLockFilePath(projectRoot);
  try {
    return await withLock(lockPath, fn);
  } catch (lockErr) {
    // Graceful degradation: proceed without lock
    process.stderr.write(
      `[memory-tiers] Lock acquisition failed, proceeding without lock: ${lockErr.message}\n`
    );
    return await fn();
  }
}

// Memory tier definitions
const MEMORY_TIERS = {
  STM: {
    name: 'short-term',
    retention: 'current_session',
    path: '.claude/context/memory/stm/',
    maxSessions: 1,
  },
  MTM: {
    name: 'mid-term',
    retention: '10_sessions',
    path: '.claude/context/memory/mtm/',
    maxSessions: 10,
  },
  LTM: {
    name: 'long-term',
    retention: 'permanent',
    path: '.claude/context/memory/ltm/',
    maxSessions: null, // unlimited but summarized
  },
};

/**
 * Get the memory directory path
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function appendTierEvent(eventType, details = {}, projectRoot = PROJECT_ROOT) {
  appendTierEventBase(eventType, details, projectRoot, ensureDir);
}

/**
 * Get the directory path for a specific memory tier.
 *
 * @param {'STM'|'MTM'|'LTM'} tier - Memory tier identifier
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {string} Absolute path to the tier directory
 * @throws {Error} If tier is unknown (not STM, MTM, or LTM)
 * @example
 * const stmPath = getTierPath('STM');
 * // Returns: '/project/.claude/context/memory/stm'
 */
function getTierPath(tier, projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  switch (tier) {
    case 'STM':
      return path.join(memoryDir, 'stm');
    case 'MTM':
      return path.join(memoryDir, 'mtm');
    case 'LTM':
      return path.join(memoryDir, 'ltm');
    default:
      throw new Error(`Unknown tier: ${tier}`);
  }
}

// ============================================================================
// STM Operations (Short-Term Memory)
// ============================================================================

/**
 * Write current session data to Short-Term Memory (STM).
 *
 * STM holds the current session's context and is cleared after
 * consolidation to MTM. Only one session can exist in STM at a time.
 *
 * @param {Object} sessionData - Session data to write
 * @param {string} [sessionData.session_id] - Unique session identifier
 * @param {string} [sessionData.timestamp] - Session timestamp
 * @param {string} [sessionData.summary] - Session summary
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {{success: boolean, path: string}} Result with success status and file path
 * @example
 * const result = writeSTMEntry({
 *   session_id: 'session-123',
 *   timestamp: new Date().toISOString(),
 *   summary: 'Implementing memory tiers'
 * });
 */
function writeSTMEntry(sessionData, projectRoot = PROJECT_ROOT) {
  const stmDir = getTierPath('STM', projectRoot);
  ensureDir(stmDir);

  const stmPath = path.join(stmDir, 'session_current.json');
  const entry = {
    ...sessionData,
    tier: 'STM',
    updated_at: new Date().toISOString(),
  };

  atomicWriteSync(stmPath, JSON.stringify(entry, null, 2));
  return { success: true, path: stmPath };
}

/**
 * Read current STM entry
 */
function readSTMEntry(projectRoot = PROJECT_ROOT) {
  const stmDir = getTierPath('STM', projectRoot);
  const stmPath = path.join(stmDir, 'session_current.json');

  if (!fs.existsSync(stmPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(stmPath, 'utf8'));
  } catch (e) {
    if (process.env.MEMORY_DEBUG) {
      console.error('[MEMORY_DEBUG]', 'readSTMEntry:', e.message);
    }
    return null;
  }
}

/**
 * Clear STM (called after session consolidation)
 */
function clearSTM(projectRoot = PROJECT_ROOT) {
  const stmDir = getTierPath('STM', projectRoot);
  const stmPath = path.join(stmDir, 'session_current.json');

  if (fs.existsSync(stmPath)) {
    fs.unlinkSync(stmPath);
  }
}

// ============================================================================
// MTM Operations (Mid-Term Memory)
// ============================================================================

/**
 * Get all sessions in MTM, sorted by timestamp (oldest first)
 */
function getMTMSessions(projectRoot = PROJECT_ROOT) {
  const mtmDir = getTierPath('MTM', projectRoot);
  ensureDir(mtmDir);

  const files = fs
    .readdirSync(mtmDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  return files
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(mtmDir, f), 'utf8'));
        return { ...data, _filename: f };
      } catch (e) {
        if (process.env.MEMORY_DEBUG) {
          console.error('[MEMORY_DEBUG]', 'getMTMSessions:', e.message);
        }
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Consolidate session from STM to MTM (Mid-Term Memory).
 *
 * Called when a session ends to move the current session data from
 * STM to MTM. If MTM exceeds max sessions (10), triggers summarization
 * of oldest sessions to LTM.
 *
 * @param {string} sessionId - Session identifier (used for tracking)
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {Object} Consolidation result
 * @returns {boolean} returns.success - Whether consolidation succeeded
 * @returns {string} [returns.mtmPath] - Path to the new MTM file (on success)
 * @returns {string} [returns.sessionId] - Session ID that was consolidated
 * @returns {string} [returns.error] - Error message (on failure)
 * @example
 * const result = consolidateSession('session-123');
 * if (result.success) {
 *   console.log('Session saved to:', result.mtmPath);
 * }
 */
function consolidateSession(sessionId, projectRoot = PROJECT_ROOT) {
  const stmDir = getTierPath('STM', projectRoot);
  const mtmDir = getTierPath('MTM', projectRoot);
  ensureDir(mtmDir);

  // Find session in STM
  const stmPath = path.join(stmDir, 'session_current.json');
  if (!fs.existsSync(stmPath)) {
    appendTierEvent('consolidate_skipped', { reason: 'no_stm', sessionId }, projectRoot);
    return { success: false, error: 'No STM session found' };
  }

  let sessionData;
  try {
    sessionData = JSON.parse(fs.readFileSync(stmPath, 'utf8'));
  } catch (e) {
    if (process.env.MEMORY_DEBUG) {
      console.error('[MEMORY_DEBUG]', 'consolidateSession:', e.message);
    }
    appendTierEvent('consolidate_failed', { reason: 'invalid_stm_json', sessionId }, projectRoot);
    return { success: false, error: 'Failed to read STM session' };
  }

  // Check if MTM is at capacity
  const mtmSessions = getMTMSessions(projectRoot);
  if (mtmSessions.length >= CONFIG.MTM_MAX_SESSIONS) {
    // Trigger summarization of oldest sessions to make room for this incoming session.
    summarizeOldSessions(projectRoot, 1);
  }

  // Generate MTM filename with timestamp
  const now = new Date();
  const timestamp = buildUniqueTimestampToken();
  const mtmFilename = `session_${timestamp}.json`;
  const mtmPath = path.join(mtmDir, mtmFilename);

  // Add consolidation metadata
  const mtmData = {
    ...sessionData,
    tier: 'MTM',
    consolidated_at: now.toISOString(),
  };

  // Write to MTM
  atomicWriteSync(mtmPath, JSON.stringify(mtmData, null, 2));

  if (isStructuredSummaryEnabled()) {
    try {
      const { generateStructuredSummaryForSession } = require('./session-summary.cjs');
      const summaryPromise = generateStructuredSummaryForSession(mtmData, {
        projectRoot,
        mtmPath,
      });
      summaryPromise.catch(err => {
        if (process.env.MEMORY_DEBUG) {
          console.error('[MEMORY_DEBUG]', 'structured summary failed:', err.message);
        }
      });
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'structured summary init failed:', e.message);
      }
    }
  }

  if (isSessionArchiveEnabled()) {
    try {
      writeSessionArchive(mtmData, mtmPath, projectRoot, {
        getTierPath,
        ensureDir,
        atomicWriteSync,
      });
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'session archive failed:', e.message);
      }
    }
  }

  // Clear STM
  clearSTM(projectRoot);

  appendTierEvent(
    'consolidated_to_mtm',
    {
      sessionId: sessionData.session_id || sessionId,
      mtmFile: path.basename(mtmPath),
      mtmSessionsAfter: getMTMSessions(projectRoot).length,
    },
    projectRoot
  );

  return {
    success: true,
    mtmPath: mtmPath,
    sessionId: sessionData.session_id || sessionId,
  };
}

/**
 * Find session in MTM by session_id
 */
function findMTMSession(sessionId, projectRoot = PROJECT_ROOT) {
  const mtmDir = getTierPath('MTM', projectRoot);
  const sessions = getMTMSessions(projectRoot);

  for (const session of sessions) {
    if (session.session_id === sessionId) {
      return {
        data: session,
        path: path.join(mtmDir, session._filename),
      };
    }
  }

  return null;
}

// ============================================================================
// LTM Operations (Long-Term Memory)
// ============================================================================

/**
 * Promote a high-value session from MTM to LTM (Long-Term Memory).
 *
 * Used for manually promoting important sessions to permanent storage.
 * The session is moved from MTM to LTM with promotion metadata added.
 *
 * @param {string} sessionId - Session ID to promote (must exist in MTM)
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {Object} Promotion result
 * @returns {boolean} returns.success - Whether promotion succeeded
 * @returns {string} [returns.ltmPath] - Path to the new LTM file (on success)
 * @returns {string} [returns.sessionId] - Session ID that was promoted
 * @returns {string} [returns.error] - Error message (on failure)
 * @example
 * const result = promoteToLTM('important-session-001');
 * if (result.success) {
 *   console.log('Session promoted to:', result.ltmPath);
 * }
 */
function promoteToLTM(sessionId, projectRoot = PROJECT_ROOT) {
  const _mtmDir = getTierPath('MTM', projectRoot);
  const ltmDir = getTierPath('LTM', projectRoot);
  ensureDir(ltmDir);

  // Find session in MTM
  const found = findMTMSession(sessionId, projectRoot);
  if (!found) {
    appendTierEvent('promote_failed', { reason: 'not_found', sessionId }, projectRoot);
    return { success: false, error: 'Session not found in MTM' };
  }

  // Generate LTM filename
  const now = new Date();
  const timestamp = buildUniqueTimestampToken();
  const ltmFilename = `promoted_${timestamp}.json`;
  const ltmPath = path.join(ltmDir, ltmFilename);

  // Add promotion metadata
  const ltmData = {
    ...found.data,
    tier: 'LTM',
    promoted_at: now.toISOString(),
    promotion_reason: 'manual_promotion',
  };
  delete ltmData._filename;

  // Write to LTM
  atomicWriteSync(ltmPath, JSON.stringify(ltmData, null, 2));

  // Remove from MTM
  if (fs.existsSync(found.path)) {
    fs.unlinkSync(found.path);
  }

  appendTierEvent(
    'promoted_to_ltm',
    {
      sessionId,
      ltmFile: path.basename(ltmPath),
    },
    projectRoot
  );

  return {
    success: true,
    ltmPath: ltmPath,
    sessionId: sessionId,
  };
}

/**
 * Generate a summary from multiple sessions (for LTM archive)
 */
function generateSessionSummary(sessions) {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  // Sort by timestamp
  const sorted = [...sessions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const startDate = sorted[0].timestamp.split('T')[0];
  const endDate = sorted[sorted.length - 1].timestamp.split('T')[0];

  // Aggregate data
  const allLearnings = [];
  const allDecisions = [];
  const allPatterns = [];
  const fileFrequency = {};

  for (const session of sessions) {
    // Collect learnings (from summaries)
    if (session.summary) {
      allLearnings.push(session.summary);
    }

    // Collect decisions
    if (session.decisions_made) {
      allDecisions.push(...session.decisions_made);
    }

    // Collect patterns
    if (session.patterns_found) {
      allPatterns.push(...session.patterns_found);
    }

    // Track file frequency
    if (session.files_modified) {
      for (const file of session.files_modified) {
        fileFrequency[file] = (fileFrequency[file] || 0) + 1;
      }
    }
  }

  // Get frequently touched files (touched more than once)
  const frequentFiles = Object.entries(fileFrequency)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([file]) => file);

  return {
    type: 'session_summary',
    date_range: {
      start: startDate,
      end: endDate,
    },
    session_count: sessions.length,
    session_ids: sessions.map(s => s.session_id).filter(Boolean),
    key_learnings: allLearnings,
    major_decisions: allDecisions,
    important_patterns: allPatterns,
    files_frequently_touched: frequentFiles,
    created_at: new Date().toISOString(),
  };
}

/**
 * Summarize old sessions from MTM to LTM
 * Called when MTM exceeds max sessions
 */
function summarizeOldSessions(projectRoot = PROJECT_ROOT, incomingSessions = 0) {
  const mtmDir = getTierPath('MTM', projectRoot);
  const ltmDir = getTierPath('LTM', projectRoot);
  ensureDir(ltmDir);

  const sessions = getMTMSessions(projectRoot);

  const normalizedIncoming = Number.isFinite(Number(incomingSessions))
    ? Math.max(0, Number(incomingSessions))
    : 0;
  const effectiveCount = sessions.length + normalizedIncoming;

  // Only summarize if current+incoming would exceed capacity.
  if (effectiveCount <= CONFIG.MTM_MAX_SESSIONS) {
    appendTierEvent(
      'summarize_skipped',
      {
        reason: 'capacity_not_exceeded',
        currentSessions: sessions.length,
        incomingSessions: normalizedIncoming,
      },
      projectRoot
    );
    return { summarized: 0, summaryPath: null };
  }

  // Calculate how many to summarize (keep MTM at max with min batch summarization).
  const toSummarize = effectiveCount - CONFIG.MTM_MAX_SESSIONS + CONFIG.SUMMARY_MIN_SESSIONS;
  const sessionsToSummarize = sessions.slice(
    0,
    Math.min(toSummarize, sessions.length - CONFIG.SUMMARY_MIN_SESSIONS)
  );

  if (sessionsToSummarize.length < CONFIG.SUMMARY_MIN_SESSIONS) {
    appendTierEvent(
      'summarize_skipped',
      {
        reason: 'insufficient_batch',
        currentSessions: sessions.length,
        incomingSessions: normalizedIncoming,
        candidateCount: sessionsToSummarize.length,
      },
      projectRoot
    );
    return { summarized: 0, summaryPath: null };
  }

  // Generate summary
  const summary = generateSessionSummary(sessionsToSummarize);

  // Write summary to LTM
  const timestamp = buildUniqueTimestampToken();
  const summaryFilename = `summary_${timestamp}.json`;
  const summaryPath = path.join(ltmDir, summaryFilename);

  atomicWriteSync(summaryPath, JSON.stringify(summary, null, 2));

  // Remove summarized sessions from MTM
  for (const session of sessionsToSummarize) {
    const sessionPath = path.join(mtmDir, session._filename);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  }

  appendTierEvent(
    'summarized_to_ltm',
    {
      summarizedCount: sessionsToSummarize.length,
      incomingSessions: normalizedIncoming,
      ltmSummaryFile: path.basename(summaryPath),
      mtmSessionsRemaining: getMTMSessions(projectRoot).length,
    },
    projectRoot
  );

  return {
    summarized: sessionsToSummarize.length,
    summaryPath: summaryPath,
    summary: summary,
  };
}

// ============================================================================
// LTM Eviction
// ============================================================================

const LTM_MAX_SUMMARIES = parseInt(process.env.LTM_MAX_SUMMARIES || '20', 10);

/**
 * Evict oldest LTM summary files when exceeding LTM_MAX_SUMMARIES.
 * Promoted files (prefixed with 'promoted_') are preserved and not counted.
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {{evicted: number}} Number of files evicted
 */
function evictOldLTMSummaries(projectRoot) {
  if (projectRoot === undefined) projectRoot = PROJECT_ROOT;
  const ltmDir = getTierPath('LTM', projectRoot);

  if (!fs.existsSync(ltmDir)) {
    return { evicted: 0 };
  }

  const files = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
  const _promoted = files.filter(f => f.startsWith('promoted_'));
  const regular = files.filter(f => !f.startsWith('promoted_'));

  // Sort regular files alphabetically (oldest first by naming convention)
  regular.sort();

  // Keep only the newest LTM_MAX_SUMMARIES regular files
  const excess = regular.length - LTM_MAX_SUMMARIES;
  if (excess > 0) {
    const toDelete = regular.slice(0, excess);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(ltmDir, file));
    }
    return { evicted: toDelete.length };
  }

  return { evicted: 0 };
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Get health status of all memory tiers.
 *
 * Returns session counts for each tier and warnings when MTM
 * is approaching its limit (8+ sessions out of 10 max).
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {Object} Tier health status
 * @returns {{sessionCount: number, warnings: string[]}} returns.stm - STM health
 * @returns {{sessionCount: number, warnings: string[]}} returns.mtm - MTM health
 * @returns {{summaryCount: number, warnings: string[]}} returns.ltm - LTM health
 * @returns {'healthy'|'warning'} returns.overall - Overall health status
 * @example
 * const health = getTierHealth();
 * if (health.overall === 'warning') {
 *   console.log('MTM warnings:', health.mtm.warnings);
 * }
 */
function getTierHealth(projectRoot = PROJECT_ROOT) {
  const result = {
    stm: { sessionCount: 0, warnings: [] },
    mtm: { sessionCount: 0, warnings: [] },
    ltm: { summaryCount: 0, warnings: [] },
    overall: 'healthy',
  };

  // Check STM
  const stmEntry = readSTMEntry(projectRoot);
  result.stm.sessionCount = stmEntry ? 1 : 0;

  // Check MTM
  const mtmSessions = getMTMSessions(projectRoot);
  result.mtm.sessionCount = mtmSessions.length;

  if (mtmSessions.length >= CONFIG.MTM_WARN_THRESHOLD) {
    result.mtm.warnings.push(
      `MTM is approaching limit: ${mtmSessions.length}/${CONFIG.MTM_MAX_SESSIONS} sessions`
    );
    result.overall = 'warning';
  }

  // Check LTM
  const ltmDir = getTierPath('LTM', projectRoot);
  if (fs.existsSync(ltmDir)) {
    const ltmFiles = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
    result.ltm.summaryCount = ltmFiles.length;
  }

  return result;
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'health':
      console.log(JSON.stringify(getTierHealth(), null, 2));
      break;

    case 'consolidate':
      const sessionId = args[1] || 'current';
      const result = consolidateSession(sessionId);
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'summarize':
      const summaryResult = summarizeOldSessions();
      console.log(JSON.stringify(summaryResult, null, 2));
      break;

    case 'promote':
      if (!args[1]) {
        console.error('Usage: memory-tiers.cjs promote <session-id>');
        process.exit(1);
      }
      const promoteResult = promoteToLTM(args[1]);
      console.log(JSON.stringify(promoteResult, null, 2));
      break;

    case 'mtm-list':
      const sessions = getMTMSessions();
      console.log(
        JSON.stringify(
          sessions.map(s => ({
            session_id: s.session_id,
            timestamp: s.timestamp,
            summary: s.summary,
          })),
          null,
          2
        )
      );
      break;

    default:
      console.log(`
Memory Tiers - STM/MTM/LTM Implementation

Commands:
  health          Check health of all memory tiers
  consolidate     Consolidate current session from STM to MTM
  summarize       Summarize old MTM sessions to LTM
  promote <id>    Promote a session from MTM to LTM
  mtm-list        List all sessions in MTM

Examples:
  node memory-tiers.cjs health
  node memory-tiers.cjs consolidate
  node memory-tiers.cjs summarize
  node memory-tiers.cjs promote session-001
  node memory-tiers.cjs mtm-list
`);
  }
}

module.exports = {
  MEMORY_TIERS,
  CONFIG,
  LTM_MAX_SUMMARIES,
  getMemoryDir,
  getTierPath,
  // STM
  writeSTMEntry,
  readSTMEntry,
  clearSTM,
  // MTM
  getMTMSessions,
  consolidateSession,
  findMTMSession,
  // LTM
  promoteToLTM,
  generateSessionSummary,
  summarizeOldSessions,
  evictOldLTMSummaries,
  // Health
  getTierHealth,
  // Locking
  withFileLock,
};
