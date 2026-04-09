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
const { safeParseJSON } = require('../utils/safe-json.cjs');

const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/** Default path to the denial log file. */
const DEFAULT_LOG_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'denial-log.json'
);
const DEFAULT_AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const DENIAL_SUGGESTION_THRESHOLD = 3;

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
 * @property {Array<{
 *   deniedTool: string,
 *   denialCount: number,
 *   agentNames: string[],
 *   message: string,
 *   alternatives: Array<{ name: string, filePath: string, tools: string[] }>
 * }>} suggestions - Suggested alternative agents for repeated denials
 * @property {boolean}           fileExists         - Whether the log file was found
 */

// ─── Core Functions ───────────────────────────────────────────────────────────

function normalizeToolName(tool) {
  return String(tool || '')
    .trim()
    .toLowerCase();
}

function normalizeFilePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function toDisplayFilePath(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return normalizeFilePath(relativePath);
  }
  return normalizeFilePath(filePath);
}

function parseAgentFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const result = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = null;
  let inArray = false;

  for (const line of lines) {
    if (/^[a-z_][a-z0-9_]*:/i.test(line)) {
      const colonIndex = line.indexOf(':');
      currentKey = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (value === '') {
        result[currentKey] = [];
        inArray = true;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        result[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        inArray = false;
      } else {
        result[currentKey] = value.replace(/^['"]|['"]$/g, '');
        inArray = false;
      }
    } else if (inArray && /^\s*-\s/.test(line)) {
      result[currentKey].push(line.replace(/^\s*-\s/, '').trim());
    }
  }

  return result;
}

function loadAgentDefinitions(agentsDir = DEFAULT_AGENTS_DIR) {
  try {
    if (!fs.existsSync(agentsDir)) return [];

    const agents = [];
    const stack = [agentsDir];

    while (stack.length > 0) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === '_archive') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const frontmatter = parseAgentFrontmatter(fs.readFileSync(fullPath, 'utf8'));
        if (!frontmatter) continue;

        const name = String(frontmatter.name || path.basename(entry.name, '.md')).trim();
        const tools = Array.isArray(frontmatter.tools)
          ? frontmatter.tools.map(tool => String(tool).trim()).filter(Boolean)
          : [];

        agents.push({
          name,
          filePath: toDisplayFilePath(fullPath),
          tools,
        });
      }
    }

    return agents.sort((left, right) => left.name.localeCompare(right.name));
  } catch (_err) {
    return [];
  }
}

function buildSuggestions(toolCounts, agentDefinitions, threshold = DENIAL_SUGGESTION_THRESHOLD) {
  const suggestions = [];
  const repeatedDenials = Object.entries(toolCounts)
    .filter(([, count]) => count >= threshold)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  if (repeatedDenials.length === 0) {
    return suggestions;
  }

  const agents = Array.isArray(agentDefinitions)
    ? agentDefinitions.filter(agent => agent && agent.name && Array.isArray(agent.tools))
    : [];

  for (const [deniedTool, denialCount] of repeatedDenials) {
    const deniedToolKey = normalizeToolName(deniedTool);
    const alternatives = agents
      .filter(agent => agent.tools.every(tool => normalizeToolName(tool) !== deniedToolKey))
      .map(agent => ({
        name: agent.name,
        filePath: agent.filePath,
        tools: agent.tools.slice(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    if (alternatives.length === 0) {
      continue;
    }

    const agentNames = alternatives.map(agent => agent.name);
    suggestions.push({
      deniedTool,
      denialCount,
      agentNames,
      message: `${deniedTool} was denied ${denialCount} times. Consider ${agentNames.join(', ')} because they do not use ${deniedTool}.`,
      alternatives,
    });
  }

  return suggestions;
}

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
    const parsed = safeParseJSON(content, []).data;
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
 * @param {{ agentDefinitions?: Array<{name:string,filePath:string,tools:string[]}>, threshold?: number }} [options]
 * @returns {DenialSummary}
 */
function buildSummary(entries, options) {
  const settings = options || {};
  const toolCounts = {};
  for (const entry of entries) {
    const tool = String(entry.tool || 'unknown');
    toolCounts[tool] = (toolCounts[tool] || 0) + 1;
  }

  const deniedTools = Object.keys(toolCounts).sort();
  const mostRecentEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const suggestions = buildSuggestions(
    toolCounts,
    settings.agentDefinitions || [],
    settings.threshold
  );

  return {
    totalDenials: entries.length,
    deniedTools,
    toolCounts,
    mostRecentEntry,
    entries,
    suggestions,
    fileExists: true, // only set false in getDenialFeedback when file absent
  };
}

/**
 * Read the denial log and return a routing feedback summary.
 * Always returns a valid DenialSummary — never throws.
 *
 * @param {string} [logFile] - Override log file path (for testing)
 * @param {{ agentsDir?: string, threshold?: number }} [options]
 * @returns {DenialSummary}
 */
function getDenialFeedback(logFile, options) {
  const filePath = logFile || DEFAULT_LOG_FILE;
  const fileExists = fs.existsSync(filePath);
  const settings = options || {};

  try {
    const entries = readDenialLog(logFile);
    const agentDefinitions =
      entries.length > 0 ? loadAgentDefinitions(settings.agentsDir || DEFAULT_AGENTS_DIR) : [];
    const summary = buildSummary(entries, {
      agentDefinitions,
      threshold: settings.threshold,
    });
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
      suggestions: [],
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
