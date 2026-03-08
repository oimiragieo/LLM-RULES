#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { withFileLock, withFileLockSync } = require('./memory-tiers-lock.cjs');
const {
  isStructuredSummaryEnabled,
  isSessionArchiveEnabled,
  writeSessionArchive,
  buildUniqueTimestampToken,
  appendTierEvent: appendTierEventBase,
} = require('./memory-tier-helpers.cjs');
const { runMemoryTiersCli } = require('./memory-tiers-cli.cjs');
const { generateSessionSummary, evictStaleLTMFiles } = require('./memory-tiers-ltm-helpers.cjs');

// BUG-001 Fix: Use canonical PROJECT_ROOT to prevent nested .claude folder creation
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// Configuration
const CONFIG = {
  MTM_MAX_SESSIONS: 10,
  MTM_WARN_THRESHOLD: 8, // Warn when approaching limit
  SUMMARY_MIN_SESSIONS: 5, // Minimum sessions to summarize
};

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

function parseJSONObjectStrict(raw) {
  try {
    // SE-02: Use safeParseJSON to prevent prototype pollution on STM/MTM files
    const { safeParseJSON } = require('../utils/safe-json.cjs');
    const parsed = safeParseJSON(raw, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    // safeParseJSON returns Object.create(null) on parse failure — detect empty results
    if (Object.keys(parsed).length === 0) {
      return null;
    }
    return parsed;
  } catch (_e) {
    return null;
  }
}

function appendTierEvent(eventType, details = {}, projectRoot = PROJECT_ROOT) {
  appendTierEventBase(eventType, details, projectRoot, ensureDir);
}

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

/**
 * Internal synchronous version of writeSTMEntry.
 */
function _writeSTMEntry(sessionData, projectRoot = PROJECT_ROOT) {
  const stmDir = getTierPath('STM', projectRoot);
  ensureDir(stmDir);

  const stmPath = path.join(stmDir, 'session_current.json');
  const entry = {
    importance: 0.5,
    consolidated: false,
    ...sessionData,
    tier: 'STM',
    updated_at: new Date().toISOString(),
  };

  atomicWriteSync(stmPath, JSON.stringify(entry, null, 2));
  return { success: true, path: stmPath };
}

/**
 * Write current session data to Short-Term Memory (STM).
 * Thread-safe with file locking.
 */
function writeSTMEntry(sessionData, projectRoot = PROJECT_ROOT) {
  return _writeSTMEntry(sessionData, projectRoot);
}

async function writeSTMEntryWithLock(sessionData, projectRoot = PROJECT_ROOT) {
  return withFileLock(() => Promise.resolve(_writeSTMEntry(sessionData, projectRoot)), projectRoot);
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
    const raw = fs.readFileSync(stmPath, 'utf8');
    return parseJSONObjectStrict(raw);
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
        const raw = fs.readFileSync(path.join(mtmDir, f), 'utf8');
        const data = parseJSONObjectStrict(raw);
        if (!data || typeof data !== 'object') return null;
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
 * Internal synchronous version of consolidateSession.
 */
function _consolidateSession(sessionId, projectRoot = PROJECT_ROOT) {
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
    const raw = fs.readFileSync(stmPath, 'utf8');
    sessionData = parseJSONObjectStrict(raw);
    if (!sessionData || typeof sessionData !== 'object') {
      throw new Error('Invalid STM JSON structure');
    }
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
    _summarizeOldSessions(projectRoot, 1);
  }

  // Generate MTM filename with timestamp
  const now = new Date();
  const timestamp = buildUniqueTimestampToken();
  const mtmFilename = `session_${timestamp}.json`;
  const mtmPath = path.join(mtmDir, mtmFilename);

  // Add consolidation metadata
  const mtmData = {
    importance: 0.5,
    consolidated: false,
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
 * Consolidate session from STM to MTM (Mid-Term Memory).
 * Thread-safe with file locking.
 */
function consolidateSession(sessionId, projectRoot = PROJECT_ROOT) {
  return withFileLockSync(() => _consolidateSession(sessionId, projectRoot), projectRoot);
}

async function consolidateSessionWithLock(sessionId, projectRoot = PROJECT_ROOT) {
  return withFileLock(
    () => Promise.resolve(_consolidateSession(sessionId, projectRoot)),
    projectRoot
  );
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

/**
 * Internal synchronous version of promoteToLTM.
 */
function _promoteToLTM(sessionId, projectRoot = PROJECT_ROOT) {
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
    importance: 0.5,
    consolidated: false,
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
 * Promote a high-value session from MTM to LTM (Long-Term Memory).
 * Thread-safe with file locking.
 */
function promoteToLTM(sessionId, projectRoot = PROJECT_ROOT) {
  return _promoteToLTM(sessionId, projectRoot);
}

async function promoteToLTMWithLock(sessionId, projectRoot = PROJECT_ROOT) {
  return withFileLock(() => Promise.resolve(_promoteToLTM(sessionId, projectRoot)), projectRoot);
}

/**
 * Internal synchronous version of summarizeOldSessions.
 */
function _summarizeOldSessions(projectRoot = PROJECT_ROOT, incomingSessions = 0) {
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
    Math.min(toSummarize, Math.max(0, sessions.length - CONFIG.SUMMARY_MIN_SESSIONS))
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

/**
 * Summarize old sessions from MTM to LTM.
 * Thread-safe with file locking.
 */
function summarizeOldSessions(projectRoot = PROJECT_ROOT, incomingSessions = 0) {
  return _summarizeOldSessions(projectRoot, incomingSessions);
}

async function summarizeOldSessionsWithLock(projectRoot = PROJECT_ROOT, incomingSessions = 0) {
  return withFileLock(
    () => Promise.resolve(_summarizeOldSessions(projectRoot, incomingSessions)),
    projectRoot
  );
}

const LTM_MAX_SUMMARIES = parseInt(process.env.LTM_MAX_SUMMARIES || '20', 10);

/**
 * Evict stale LTM entries using a utility-based decay formula.
 * utility = access_count * (1 / (1 + staleness_days * DECAY_FACTOR))
 * Entries with utility < EVICTION_THRESHOLD are deleted.
 * Only runs when LTM file count exceeds LTM_MAX_FILES.
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {{evicted: number, skipped: string|undefined}} Result summary
 */
function evictStaleLTM(projectRoot) {
  if (projectRoot === undefined) projectRoot = PROJECT_ROOT;
  const ltmDir = getTierPath('LTM', projectRoot);
  return evictStaleLTMFiles(ltmDir);
}

function evictOldLTMSummaries(projectRoot) {
  if (projectRoot === undefined) projectRoot = PROJECT_ROOT;
  const ltmDir = getTierPath('LTM', projectRoot);

  if (!fs.existsSync(ltmDir)) {
    return { evicted: 0 };
  }

  const files = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
  const _promoted = files.filter(f => f.startsWith('promoted_'));
  // Only summary_*.json files are candidates for eviction; other .json files are preserved
  const regular = files.filter(f => f.startsWith('summary_'));

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

if (require.main === module) {
  runMemoryTiersCli({
    getTierHealth,
    consolidateSession,
    summarizeOldSessions,
    promoteToLTM,
    getMTMSessions,
  }).catch(err => {
    console.error('Unhandled error:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  MEMORY_TIERS,
  CONFIG,
  LTM_MAX_SUMMARIES,
  getMemoryDir,
  getTierPath,
  // STM
  writeSTMEntry,
  writeSTMEntryWithLock,
  readSTMEntry,
  clearSTM,
  // MTM
  getMTMSessions,
  consolidateSession,
  consolidateSessionWithLock,
  findMTMSession,
  // LTM
  promoteToLTM,
  promoteToLTMWithLock,
  generateSessionSummary,
  summarizeOldSessions,
  summarizeOldSessionsWithLock,
  evictStaleLTM,
  evictOldLTMSummaries,
  // Health
  getTierHealth,
  // Locking
  withFileLock,
  // Export internals for legacy/sync usage if absolutely needed (though deprecated)
  _writeSTMEntry,
  _consolidateSession,
  _summarizeOldSessions,
  _promoteToLTM,
};
