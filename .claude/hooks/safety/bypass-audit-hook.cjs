#!/usr/bin/env node
/**
 * Bypass Audit Hook (SEC-AUDIT-020)
 * ===================================
 *
 * Implements Option C from the bypass audit design:
 * .claude/context/plans/bypass-audit-design-2026-02-20.md
 *
 * PROBLEM: When Claude Code runs with bypassPermissions mode enabled, all
 * PreToolUse hook block verdicts (exit code 2) are advisory only. The tool
 * call proceeds regardless. This hook provides an audit trail for such bypasses.
 *
 * APPROACH (Option C):
 * - PreToolUse hooks call emitBlockVerdict() to write a structured record to
 *   bypass-audit.jsonl BEFORE returning exit code 2.
 * - This PostToolUse hook (detectBypass) scans recent records after the tool
 *   completes and confirms bypasses by correlation ID matching.
 * - Tiered alerts: INFO(1-5), WARN(6-20), ALERT(21-50), CRITICAL(51+)
 *
 * File: .claude/context/runtime/bypass-audit.jsonl (append-only)
 * Config: BYPASS_AUDIT_ENABLED, BYPASS_AUDIT_PATH, BYPASS_AUDIT_*_THRESHOLD,
 *         BYPASS_AUDIT_CORRELATION_WINDOW_MS, BYPASS_AUDIT_MAX_TAIL_LINES
 *
 * Exit codes:
 * - 0: Always (PostToolUse hooks are advisory, never block)
 *
 * OWASP: A09:2025 (Security Logging), ASI02 (Tool Misuse), ASI10 (Rogue Agents)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// Resolve project root and default audit path
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_AUDIT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'bypass-audit.jsonl'
);
const DEFAULT_ALERT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'bypass-alert.json'
);

const HOOK_NAME = 'bypass-audit-hook';

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

/**
 * Get the resolved audit JSONL path (env override or default).
 * @returns {string}
 */
function getAuditPath(override) {
  return override || process.env.BYPASS_AUDIT_PATH || DEFAULT_AUDIT_PATH;
}

/**
 * Check whether the bypass audit system is enabled.
 * @returns {boolean}
 */
function isEnabled() {
  const val = process.env.BYPASS_AUDIT_ENABLED;
  if (!val) return true; // default: enabled
  return val.toLowerCase() !== 'false' && val !== '0';
}

/**
 * Read a numeric threshold from env with a fallback default.
 * @param {string} envVar
 * @param {number} defaultVal
 * @returns {number}
 */
function readThreshold(envVar, defaultVal) {
  const raw = process.env[envVar];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

/**
 * Read the correlation window in milliseconds (default: 5000 ms).
 * @returns {number}
 */
function getCorrelationWindowMs() {
  return readThreshold('BYPASS_AUDIT_CORRELATION_WINDOW_MS', 5000);
}

/**
 * Read the max tail-read line count (default: 100).
 * @returns {number}
 */
function getMaxTailLines() {
  return readThreshold('BYPASS_AUDIT_MAX_TAIL_LINES', 100);
}

// ---------------------------------------------------------------------------
// Correlation ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a unique correlation ID for a tool invocation.
 * Format: {epochMs}-{tool}-{pathHash10}
 *
 * @param {string} tool - Tool name (e.g., 'Write', 'Edit')
 * @param {string} [filePath] - Target file path
 * @returns {string} Unique correlation ID
 */
function generateCorrelationId(tool, filePath) {
  const epochMs = Date.now();
  const pathHash = crypto
    .createHash('sha256')
    .update(filePath || 'no-path')
    .digest('hex')
    .slice(0, 10);
  return `${epochMs}-${tool}-${pathHash}`;
}

// ---------------------------------------------------------------------------
// JSONL helpers (append-only, best-effort)
// ---------------------------------------------------------------------------

/**
 * Ensure the directory for a file exists.
 * Best-effort — swallows errors.
 * @param {string} filePath
 */
function ensureDir(filePath) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (_) {
    // best-effort
  }
}

/**
 * Append a JSON record as a JSONL line to a file.
 * Best-effort — logs to stderr on failure, never throws.
 *
 * @param {string} filePath - JSONL file path
 * @param {Object} record - Record to append
 */
function appendRecord(filePath, record) {
  try {
    ensureDir(filePath);
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        hook: HOOK_NAME,
        event: 'append_error',
        error: err.message,
        timestamp: new Date().toISOString(),
      }) + '\n'
    );
  }
}

/**
 * Read the last N lines from a JSONL file.
 * Returns an empty array if the file does not exist or is unreadable.
 *
 * @param {string} filePath - JSONL file path
 * @param {number} maxLines - Maximum lines to read from the end
 * @returns {string[]} Array of raw line strings
 */
function readTailLines(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-maxLines);
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------

/**
 * Emit a block_verdict record to the bypass audit JSONL.
 * Called by PreToolUse hooks immediately before returning exit code 2.
 * Best-effort: failure does not affect the hook exit code.
 *
 * @param {Object} params
 * @param {string} params.hook - Hook name that issued the block
 * @param {string} params.tool - Tool being blocked (e.g., 'Write', 'Edit')
 * @param {string} [params.filePath] - Target file path (normalized)
 * @param {string} params.reason - Human-readable block reason
 * @param {string} [params.artifactType] - Artifact type (e.g., 'hook', 'agent')
 * @param {string} [params.requiredCreator] - Creator skill required
 * @param {string} [params.enforcementMode] - Enforcement mode ('block'|'warn')
 * @param {string} [params.sessionId] - Session ID for correlation
 * @param {string} [params.auditPath] - Override audit file path (for testing)
 * @returns {string} correlationId — use for PostToolUse matching
 */
function emitBlockVerdict(params) {
  const {
    hook = HOOK_NAME,
    tool = 'Unknown',
    filePath = '',
    reason = '',
    artifactType,
    requiredCreator,
    enforcementMode,
    sessionId,
    auditPath,
  } = params || {};

  const correlationId = generateCorrelationId(tool, filePath);
  const resolvedPath = getAuditPath(auditPath);

  const record = {
    type: 'block_verdict',
    correlationId,
    timestamp: new Date().toISOString(),
    hook,
    tool,
    filePath: filePath ? filePath.replace(/\\/g, '/') : '',
    verdict: 'block',
    reason,
    pid: process.pid,
  };

  if (artifactType !== undefined) record.artifactType = artifactType;
  if (requiredCreator !== undefined) record.requiredCreator = requiredCreator;
  if (enforcementMode !== undefined) record.enforcementMode = enforcementMode;
  if (sessionId !== undefined) record.sessionId = sessionId;

  appendRecord(resolvedPath, record);
  return correlationId;
}

/**
 * Detect whether a tool succeeded despite a prior block verdict.
 * Called by PostToolUse hooks after the tool completes.
 *
 * Reads the last BYPASS_AUDIT_MAX_TAIL_LINES lines of bypass-audit.jsonl,
 * finds any block_verdict records matching tool + filePath within the
 * BYPASS_AUDIT_CORRELATION_WINDOW_MS window, and appends a bypass_confirmed
 * record if a match is found.
 *
 * @param {Object} params
 * @param {string} params.tool - Tool that just completed (e.g., 'Write')
 * @param {string} [params.filePath] - Target file path (normalized)
 * @param {string} [params.sessionId] - Session ID
 * @param {string} [params.auditPath] - Override audit file path (for testing)
 * @returns {{ correlationId: string, outcome: string, ... } | null}
 *   The bypass record if a bypass is detected; null otherwise.
 */
function detectBypass(params) {
  const { tool = '', filePath = '', sessionId, auditPath } = params || {};

  // No-op when disabled
  if (!isEnabled()) return null;

  const resolvedPath = getAuditPath(auditPath);
  const maxLines = getMaxTailLines();
  const windowMs = getCorrelationWindowMs();
  const now = Date.now();

  const lines = readTailLines(resolvedPath, maxLines);

  // Normalize the search filePath for comparison
  const normalizedSearch = (filePath || '').replace(/\\/g, '/');

  // Find the most recent matching block_verdict within the time window
  let matchedRecord = null;
  for (const line of lines) {
    try {
      const record = safeParseJSON(line, null);
      if (!record || record.type !== 'block_verdict') continue;
      if (record.tool !== tool) continue;

      const normalizedRecord = (record.filePath || '').replace(/\\/g, '/');
      if (normalizedRecord !== normalizedSearch) continue;

      const recordTime = new Date(record.timestamp).getTime();
      if (!Number.isFinite(recordTime)) continue;
      if (now - recordTime > windowMs) continue;

      // Use the most recent match
      if (!matchedRecord) {
        matchedRecord = record;
      } else {
        const existingTime = new Date(matchedRecord.timestamp).getTime();
        if (recordTime > existingTime) {
          matchedRecord = record;
        }
      }
    } catch (_) {
      // Skip malformed lines
    }
  }

  if (!matchedRecord) return null;

  // Count cumulative bypasses in the current audit file
  let cumulativeBypassCount = 0;
  for (const line of lines) {
    try {
      const r = safeParseJSON(line, null);
      if (r && r.type === 'bypass_confirmed') cumulativeBypassCount++;
    } catch (_) {
      /* skip */
    }
  }
  cumulativeBypassCount++; // include this one

  const bypassRecord = {
    type: 'bypass_confirmed',
    correlationId: matchedRecord.correlationId,
    timestamp: new Date().toISOString(),
    hook: HOOK_NAME,
    tool,
    filePath: normalizedSearch,
    outcome: 'tool_succeeded_despite_block',
    blockingHook: matchedRecord.hook,
    bypassMode: true,
    pid: process.pid,
    cumulativeBypassCount,
  };

  if (sessionId !== undefined) bypassRecord.sessionId = sessionId;
  else if (matchedRecord.sessionId !== undefined) bypassRecord.sessionId = matchedRecord.sessionId;

  // Append the bypass_confirmed record
  appendRecord(resolvedPath, bypassRecord);

  // Emit alert to stderr based on threshold
  const severity = getAlertSeverity(cumulativeBypassCount);
  if (severity !== 'INFO') {
    process.stderr.write(
      JSON.stringify({
        hook: HOOK_NAME,
        event: `bypass_${severity.toLowerCase()}`,
        severity,
        cumulativeBypassCount,
        tool,
        filePath: normalizedSearch,
        correlationId: matchedRecord.correlationId,
        timestamp: new Date().toISOString(),
        message: `[${severity}] bypassPermissions override detected — ${cumulativeBypassCount} bypass(es) in session`,
      }) + '\n'
    );

    // Write CRITICAL alert file
    if (severity === 'CRITICAL') {
      _writeCriticalAlertFile(cumulativeBypassCount, resolvedPath);
    }
  }

  return bypassRecord;
}

/**
 * Write a dedicated critical alert file when the CRITICAL threshold is exceeded.
 * Best-effort — swallows errors.
 *
 * @param {number} totalBypasses
 * @param {string} auditPath
 */
function _writeCriticalAlertFile(totalBypasses, auditPath) {
  try {
    const alertFile = DEFAULT_ALERT_PATH;
    ensureDir(alertFile);
    const alert = {
      type: 'BYPASS_PERMISSIONS_ALERT',
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      totalBypasses,
      auditFile: auditPath,
      recommendation:
        'Review session for unauthorized artifact modifications. Consider running without bypassPermissions for security-sensitive work.',
    };
    fs.writeFileSync(alertFile, JSON.stringify(alert, null, 2) + '\n', 'utf8');
  } catch (_) {
    // best-effort
  }
}

/**
 * Determine alert severity based on cumulative bypass count.
 * Reads thresholds from environment variables with defaults:
 *   WARN_THRESHOLD  = 6  (INFO below, WARN at/above)
 *   ALERT_THRESHOLD = 21 (WARN below, ALERT at/above)
 *   CRITICAL_THRESHOLD = 51 (ALERT below, CRITICAL at/above)
 *
 * @param {number} count - Cumulative bypass count in the session
 * @returns {'INFO'|'WARN'|'ALERT'|'CRITICAL'}
 */
function getAlertSeverity(count) {
  const warnThreshold = readThreshold('BYPASS_AUDIT_WARN_THRESHOLD', 6);
  const alertThreshold = readThreshold('BYPASS_AUDIT_ALERT_THRESHOLD', 21);
  const criticalThreshold = readThreshold('BYPASS_AUDIT_CRITICAL_THRESHOLD', 51);

  if (count >= criticalThreshold) return 'CRITICAL';
  if (count >= alertThreshold) return 'ALERT';
  if (count >= warnThreshold) return 'WARN';
  return 'INFO';
}

// ---------------------------------------------------------------------------
// PostToolUse main entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point for PostToolUse execution.
 * Reads hook input from stdin, detects bypasses, exits 0 (always advisory).
 *
 * @returns {Promise<void>}
 */
async function main() {
  // Always exit 0 — PostToolUse hooks are advisory
  try {
    if (!isEnabled()) {
      process.exit(0);
    }

    // Read hook input from stdin
    let raw = '';
    if (!process.stdin.isTTY) {
      await new Promise(resolve => {
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
          raw += chunk;
        });
        process.stdin.on('end', resolve);
        process.stdin.on('error', resolve);
        setTimeout(resolve, 200);
        process.stdin.resume();
      });
    }

    if (!raw.trim()) {
      process.exit(0);
    }

    const input = safeParseJSON(raw.trim(), null);
    if (!input) {
      process.exit(0);
    }

    const toolName = input.tool_name || input.tool || '';
    const toolInput = input.tool_input || input.input || {};
    const filePath =
      toolInput.file_path || toolInput.filePath || toolInput.path || toolInput.notebook_path || '';
    const sessionId = input.session_id;

    // Only process Write and Edit tools (as per design doc section 4.2)
    if (!toolName || !['Write', 'Edit', 'NotebookEdit'].includes(toolName)) {
      process.exit(0);
    }

    detectBypass({ tool: toolName, filePath, sessionId });
  } catch (_) {
    // Best-effort — never crash
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Module entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = {
  emitBlockVerdict,
  detectBypass,
  getAlertSeverity,
  generateCorrelationId,
  getAuditPath,
  isEnabled,
  main,
  PROJECT_ROOT,
  DEFAULT_AUDIT_PATH,
  HOOK_NAME,
};
