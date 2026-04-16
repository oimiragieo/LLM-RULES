'use strict';

/**
 * Trajectory Logger — ATIF-compatible PostToolUse hook
 *
 * Type: PostToolUse (async, fail-open)
 * Purpose: Log each tool call as structured JSONL for replay and analysis
 * Output: .claude/context/logs/trajectory-YYYY-MM-DD.jsonl
 *
 * Exit codes:
 * - 0: Always (fail-open — never blocks tool pipeline)
 *
 * Performance budget: <50ms (append-only file write)
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

/**
 * Sanitize and truncate a value for safe JSONL logging.
 * @param {*} value - The value to sanitize
 * @param {number} maxLen - Maximum character length (default 200)
 * @returns {string} Sanitized string
 */
function sanitize(value, maxLen = 200) {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const cleaned = str.replace(/[\r\n\t]/g, ' ').slice(0, maxLen);
  return cleaned;
}

/**
 * Get today's log file path.
 * @returns {string} Absolute path to today's trajectory JSONL file
 */
function getLogPath() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(PROJECT_ROOT, '.claude', 'context', 'logs', `trajectory-${today}.jsonl`);
}

/**
 * Ensure the logs directory exists.
 * @param {string} logPath - Full path to log file
 */
function ensureDir(logPath) {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Build a trajectory record from hook input.
 * @param {Object} hookInput - Parsed hook input from Claude Code
 * @returns {Object} Structured trajectory record
 */
function buildRecord(hookInput) {
  const toolName = hookInput.tool_name || hookInput.tool || '';
  const toolInput = hookInput.tool_input || hookInput.input || {};
  const toolOutput = hookInput.tool_output || hookInput.output || {};

  return {
    timestamp: new Date().toISOString(),
    session_id: process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || 'unknown',
    tool_name: toolName,
    tool_input_summary: sanitize(toolInput),
    tool_output_summary: sanitize(toolOutput),
    exit_code: 0,
    duration_ms: null,
    agent_type: process.env.AGENT_TYPE || hookInput.agent_type || '',
    task_id: process.env.TASK_ID || hookInput.task_id || '',
  };
}

/**
 * Append a trajectory record to the daily log file.
 * @param {Object} record - The trajectory record to log
 */
function appendRecord(record) {
  const logPath = getLogPath();
  ensureDir(logPath);
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(logPath, line, 'utf8');
}

/**
 * Main execution for CLI hook usage.
 */
function main() {
  try {
    let hookInput = null;

    // Claude Code passes JSON via stdin for PostToolUse hooks
    if (process.argv[2]) {
      try {
        hookInput = safeParseJSON(process.argv[2], 'trajectory-logger', undefined, null);
        if (!hookInput || Object.keys(hookInput).length === 0) hookInput = null;
      } catch (_e) {
        // Not valid JSON arg, ignore
      }
    }

    // Also try stdin if no arg
    if (!hookInput) {
      try {
        const stdinData = fs.readFileSync(0, 'utf8');
        if (stdinData && stdinData.trim()) {
          hookInput = safeParseJSON(stdinData.trim(), 'trajectory-logger', undefined, null);
          if (!hookInput || Object.keys(hookInput).length === 0) hookInput = null;
        }
      } catch (_e) {
        // No stdin or invalid, ignore
      }
    }

    if (!hookInput) {
      // No input — nothing to log
      process.exit(0);
    }

    const record = buildRecord(hookInput);
    appendRecord(record);
  } catch (_err) {
    // Fail-open: never block tool pipeline
    // Silently exit 0 on any error
  }

  process.exit(0);
}

// Run main if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  sanitize,
  getLogPath,
  ensureDir,
  buildRecord,
  appendRecord,
  findProjectRoot,
  PROJECT_ROOT,
};
