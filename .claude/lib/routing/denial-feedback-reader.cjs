#!/usr/bin/env node
'use strict';

/**
 * denial-feedback-reader.cjs — Routing Feedback from Denial Log
 * ==============================================================
 *
 * Reads the denial-log.json written by the PermissionDenied hook and
 * returns a structured summary of denial patterns for use by the routing
 * system (e.g., to detect systematic tool-lockdown violations, or to
 * surface recurring denial patterns to the orchestrator).
 *
 * The denial log is an append-only JSON array with entries shaped as:
 *   { tool: string, reason: string, timestamp: string, session_id: string }
 *
 * Returns gracefully (empty summary, no crash) when the log is:
 *   - Missing (file does not exist)
 *   - Empty
 *   - Corrupted (non-JSON or not an array)
 *
 * @module denial-feedback-reader
 */

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/** Default path to the denial log file. */
const DEFAULT_LOG_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'denial-log.json'
);

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DenialEntry
 * @property {string} tool        - The tool that was denied
 * @property {string} reason      - The reason for denial
 * @property {string} timestamp   - ISO 8601 timestamp
 * @property {string} session_id  - Session identifier (may be empty)
 */

/**
 * @typedef {Object} DenialSummary
 * @property {number}            totalDenials       - Total number of denial entries
 * @property {string[]}          deniedTools        - Unique tool names denied (sorted)
 * @property {Record<string,number>} toolCounts     - Map of tool → denial count
 * @property {DenialEntry|null}  mostRecentEntry    - Most recent entry or null
 * @property {DenialEntry[]}     entries            - All entries (may be empty)
 * @property {boolean}           fileExists         - Whether the log file was found
 */

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Read and parse the denial log file.
 * Returns an empty array when the file is missing, empty, or corrupted.
 *
 * @param {string} [logFile] - Override log file path (for testing)
 * @returns {DenialEntry[]}
 */
function readDenialLog(logFile) {
  const filePath = logFile || DEFAULT_LOG_FILE;
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) {
      return [];
    }
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (_err) {
    // Corruption or parse error — treat as empty
    return [];
  }
}

/**
 * Build a routing feedback summary from denial log entries.
 *
 * @param {DenialEntry[]} entries - Parsed denial log entries
 * @returns {DenialSummary}
 */
function buildSummary(entries) {
  const toolCounts = {};
  for (const entry of entries) {
    const tool = String(entry.tool || 'unknown');
    toolCounts[tool] = (toolCounts[tool] || 0) + 1;
  }

  const deniedTools = Object.keys(toolCounts).sort();
  const mostRecentEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  return {
    totalDenials: entries.length,
    deniedTools,
    toolCounts,
    mostRecentEntry,
    entries,
    fileExists: true, // only set false in getDenialFeedback when file absent
  };
}

/**
 * Read the denial log and return a routing feedback summary.
 * Always returns a valid DenialSummary — never throws.
 *
 * @param {string} [logFile] - Override log file path (for testing)
 * @returns {DenialSummary}
 */
function getDenialFeedback(logFile) {
  const filePath = logFile || DEFAULT_LOG_FILE;
  const fileExists = fs.existsSync(filePath);

  try {
    const entries = readDenialLog(logFile);
    const summary = buildSummary(entries);
    summary.fileExists = fileExists;
    return summary;
  } catch (_err) {
    // Absolute fail-safe: return empty summary on any unexpected error
    return {
      totalDenials: 0,
      deniedTools: [],
      toolCounts: {},
      mostRecentEntry: null,
      entries: [],
      fileExists: false,
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getDenialFeedback,
  readDenialLog,
  buildSummary,
  DEFAULT_LOG_FILE,
};
