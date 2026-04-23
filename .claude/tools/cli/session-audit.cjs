#!/usr/bin/env node
'use strict';

/**
 * session-audit — per-component token burn table CLI (v2.4.0 S2)
 *
 * Usage:
 *   node .claude/tools/cli/session-audit.cjs <session-id> [options]
 *
 * Options:
 *   --agent <id>     Filter output to a single agent
 *   --tool  <name>   Filter output to a single tool name
 *   --format json    Emit JSON (default: text table)
 *
 * Reads:
 *   .claude/context/runtime/traces/<session-id>.jsonl
 *
 * Token thresholds (ANSI colours in text mode):
 *   green  — tool name label
 *   yellow — row total > 5 000 tokens
 *   red    — row total > 25 000 tokens
 */

const fs = require('node:fs');
const path = require('node:path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// ---------------------------------------------------------------------------
// ANSI helpers (inline — no chalk dependency)
// ---------------------------------------------------------------------------

const ANSI = {
  reset: '\x1b[0m',
  bold: s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  gray: s => `\x1b[90m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv  process.argv
 * @returns {{ sessionId: string|null, agentFilter: string|null, toolFilter: string|null, format: string, error: string|null }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let sessionId = null;
  let agentFilter = null;
  let toolFilter = null;
  let format = 'text';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--agent') {
      agentFilter = args[++i] || null;
    } else if (a === '--tool') {
      toolFilter = args[++i] || null;
    } else if (a === '--format') {
      format = args[++i] || 'text';
    } else if (!a.startsWith('--')) {
      sessionId = a;
    }
  }

  if (!sessionId) {
    return { sessionId: null, agentFilter, toolFilter, format, error: 'missing-session-id' };
  }
  return { sessionId, agentFilter, toolFilter, format, error: null };
}

// ---------------------------------------------------------------------------
// JSONL reader
// ---------------------------------------------------------------------------

/**
 * Load and parse all records from a trace JSONL file.
 * @param {string} tracePath  Absolute path to the .jsonl file
 * @returns {Object[]}
 */
function loadTraceRecords(tracePath) {
  if (!fs.existsSync(tracePath)) return [];
  const raw = fs.readFileSync(tracePath, 'utf8').trim();
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const record = safeParseJSON(line, 'session-audit', undefined, null);
    if (record && typeof record === 'object') out.push(record);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate trace records by agent_id × tool_name.
 *
 * @param {Object[]} records
 * @param {{ agentFilter?: string|null, toolFilter?: string|null }} opts
 * @returns {Object}  keyed by agent_id
 *   Each value: { totalTokens, totalCalls, tools: { [toolName]: { tokens, calls, durations[] } } }
 */
function aggregateByAgent(records, opts = {}) {
  const { agentFilter = null, toolFilter = null } = opts;
  const result = {};

  for (const rec of records) {
    const agentId = rec.agent_id || '(unknown)';
    const toolName = rec['gen_ai.tool.name'] || '(unknown)';
    const tokens =
      typeof rec['gen_ai.usage.total_tokens'] === 'number' &&
      !isNaN(rec['gen_ai.usage.total_tokens'])
        ? rec['gen_ai.usage.total_tokens']
        : null;
    const durationMs =
      typeof rec.duration_ms === 'number' && !isNaN(rec.duration_ms) ? rec.duration_ms : null;

    // Apply filters
    if (agentFilter && agentId !== agentFilter) continue;
    if (toolFilter && toolName !== toolFilter) continue;

    if (!result[agentId]) {
      result[agentId] = { totalTokens: 0, totalCalls: 0, tools: {} };
    }
    if (!result[agentId].tools[toolName]) {
      result[agentId].tools[toolName] = { tokens: 0, calls: 0, durations: [], hasTokenData: false };
    }

    result[agentId].totalCalls += 1;
    result[agentId].tools[toolName].calls += 1;

    if (tokens !== null) {
      result[agentId].totalTokens += tokens;
      result[agentId].tools[toolName].tokens += tokens;
      result[agentId].tools[toolName].hasTokenData = true;
    }

    if (durationMs !== null) {
      result[agentId].tools[toolName].durations.push(durationMs);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Text table renderer
// ---------------------------------------------------------------------------

/**
 * Render aggregation as a colour-coded ANSI text table.
 * @param {Object} agg  Output of aggregateByAgent()
 * @returns {string}
 */
function renderTable(agg) {
  const agentIds = Object.keys(agg).sort();
  if (!agentIds.length) return ANSI.gray('(no trace records found)');

  const COL_AGENT = 20;
  const COL_TOOL = 20;
  const COL_CALLS = 7;
  const COL_TOKENS = 12;
  const COL_P50 = 10;
  const COL_P95 = 10;

  function pad(s, n) {
    const str = String(s);
    return str.length >= n ? str.slice(0, n - 1) + ' ' : str + ' '.repeat(n - str.length);
  }

  const header =
    ANSI.bold(
      pad('AGENT', COL_AGENT) +
        pad('TOOL', COL_TOOL) +
        pad('CALLS', COL_CALLS) +
        pad('TOKENS', COL_TOKENS) +
        pad('p50ms', COL_P50) +
        pad('p95ms', COL_P95)
    ) +
    '\n' +
    ANSI.dim('─'.repeat(COL_AGENT + COL_TOOL + COL_CALLS + COL_TOKENS + COL_P50 + COL_P95)) +
    '\n';

  const rows = [];

  for (const agentId of agentIds) {
    const agentData = agg[agentId];
    const toolNames = Object.keys(agentData.tools).sort();

    for (let t = 0; t < toolNames.length; t++) {
      const toolName = toolNames[t];
      const toolData = agentData.tools[toolName];
      const tokens = toolData.hasTokenData ? toolData.tokens : null;
      const p50 = percentile(toolData.durations, 0.5);
      const p95 = percentile(toolData.durations, 0.95);

      const agentLabel = t === 0 ? agentId : '';
      const tokenStr = tokens === null ? '—' : String(tokens);
      const p50Str = p50 === null ? '—' : String(p50);
      const p95Str = p95 === null ? '—' : String(p95);

      // Colour-code token column
      let colouredTokens;
      if (tokens === null) {
        colouredTokens = ANSI.dim(tokenStr);
      } else if (tokens > 25000) {
        colouredTokens = ANSI.red(tokenStr);
      } else if (tokens > 5000) {
        colouredTokens = ANSI.yellow(tokenStr);
      } else {
        colouredTokens = tokenStr;
      }

      const row =
        pad(agentLabel, COL_AGENT) +
        ANSI.green(pad(toolName, COL_TOOL)) +
        pad(toolData.calls, COL_CALLS) +
        pad(colouredTokens, COL_TOKENS) +
        pad(p50Str, COL_P50) +
        pad(p95Str, COL_P95);

      rows.push(row);
    }

    // Agent subtotal line
    const agentTokenStr =
      agentData.totalTokens === 0 && !Object.values(agentData.tools).some(t => t.hasTokenData)
        ? '—'
        : String(agentData.totalTokens);

    let colouredAgentTokens;
    if (agentTokenStr === '—') {
      colouredAgentTokens = ANSI.dim(agentTokenStr);
    } else if (agentData.totalTokens > 25000) {
      colouredAgentTokens = ANSI.red(agentTokenStr);
    } else if (agentData.totalTokens > 5000) {
      colouredAgentTokens = ANSI.yellow(agentTokenStr);
    } else {
      colouredAgentTokens = agentTokenStr;
    }

    const subtotal =
      ANSI.dim('─'.repeat(COL_AGENT + COL_TOOL + COL_CALLS + COL_TOKENS + COL_P50 + COL_P95)) +
      '\n' +
      pad(agentId + ' total', COL_AGENT + COL_TOOL) +
      pad(agentData.totalCalls, COL_CALLS) +
      pad(colouredAgentTokens, COL_TOKENS) +
      '\n';

    rows.push(subtotal);
  }

  return header + rows.join('\n');
}

// ---------------------------------------------------------------------------
// JSON renderer
// ---------------------------------------------------------------------------

/**
 * Render aggregation as JSON string.
 * @param {Object} agg  Output of aggregateByAgent()
 * @returns {string}
 */
function renderJson(agg) {
  const agents = {};
  for (const [agentId, data] of Object.entries(agg)) {
    agents[agentId] = {
      totalTokens: data.totalTokens,
      totalCalls: data.totalCalls,
      tools: {},
    };
    for (const [toolName, toolData] of Object.entries(data.tools)) {
      agents[agentId].tools[toolName] = {
        tokens: toolData.hasTokenData ? toolData.tokens : null,
        calls: toolData.calls,
        p50ms: percentile(toolData.durations, 0.5),
        p95ms: percentile(toolData.durations, 0.95),
      };
    }
  }
  return JSON.stringify({ agents }, null, 2);
}

// ---------------------------------------------------------------------------
// Resolve trace path for a session id
// ---------------------------------------------------------------------------

function findProjectRoot(startDir) {
  let dir = startDir || __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveTracePath(sessionId) {
  const root = findProjectRoot();
  return path.join(root, '.claude', 'context', 'runtime', 'traces', `${sessionId}.jsonl`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv);

  if (opts.error === 'missing-session-id') {
    console.error(
      'Usage: pnpm session:audit <session-id> [--agent <id>] [--tool <name>] [--format json]'
    );
    process.exit(1);
  }

  const tracePath = resolveTracePath(opts.sessionId);

  if (!fs.existsSync(tracePath)) {
    console.error(`No trace file found for session "${opts.sessionId}"`);
    console.error(`Expected: ${tracePath}`);
    process.exit(1);
  }

  const records = loadTraceRecords(tracePath);
  const agg = aggregateByAgent(records, {
    agentFilter: opts.agentFilter,
    toolFilter: opts.toolFilter,
  });

  if (opts.format === 'json') {
    console.log(renderJson(agg));
  } else {
    console.log(ANSI.bold(`\nSession Audit: ${opts.sessionId}`));
    console.log(ANSI.gray(`Trace file: ${tracePath}`));
    console.log(ANSI.gray(`Records: ${records.length}\n`));
    console.log(renderTable(agg));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  loadTraceRecords,
  aggregateByAgent,
  renderTable,
  renderJson,
};
