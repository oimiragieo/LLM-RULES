#!/usr/bin/env node
'use strict';

/**
 * trace-viewer — CLI for inspecting OTel GenAI trace JSONL files
 *
 * Usage:
 *   node .claude/tools/cli/trace-viewer.cjs <session-id> [options]
 *
 * Options:
 *   --tool <name>         Filter by gen_ai.tool.name (substring match)
 *   --agent <id>          Filter by agent_id (substring match)
 *   --min-duration <ms>   Only show lines with duration_ms >= value
 *   --help                Print usage
 *
 * Exit codes:
 *   0 — OK (or no matching lines)
 *   1 — Missing session-id argument or trace file not found
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// ANSI colour helpers (no external deps)
// ---------------------------------------------------------------------------

const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;

const c = {
  green: s => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
  yellow: s => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
  red: s => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
  cyan: s => (NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`),
  bold: s => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
  dim: s => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
};

// ---------------------------------------------------------------------------
// Project root
// ---------------------------------------------------------------------------

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    return { help: true };
  }

  const opts = {
    sessionId: null,
    tool: null,
    agent: null,
    minDuration: null,
  };

  let i = 0;
  // First positional arg is session-id
  if (args[0] && !args[0].startsWith('--')) {
    opts.sessionId = args[0];
    i = 1;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === '--tool' && args[i + 1]) {
      opts.tool = args[i + 1];
      i += 2;
    } else if (arg === '--agent' && args[i + 1]) {
      opts.agent = args[i + 1];
      i += 2;
    } else if (arg === '--min-duration' && args[i + 1]) {
      opts.minDuration = parseInt(args[i + 1], 10);
      i += 2;
    } else {
      i++;
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

function matchesFilters(line, opts) {
  if (opts.tool && !String(line['gen_ai.tool.name'] || '').includes(opts.tool)) {
    return false;
  }
  if (opts.agent && !String(line.agent_id || '').includes(opts.agent)) {
    return false;
  }
  if (opts.minDuration !== null) {
    const dur = typeof line.duration_ms === 'number' ? line.duration_ms : -1;
    if (dur < opts.minDuration) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pretty-print a single trace line
// ---------------------------------------------------------------------------

const HIGH_DURATION_THRESHOLD_MS = 500;

function formatLine(line, index) {
  const toolName = line['gen_ai.tool.name'] || 'unknown';
  const argsHash = line['gen_ai.tool.args_hash'] || '?';
  const resultHash = line['gen_ai.tool.result_hash'] || '?';
  const ts = line.timestamp || '';
  const dur = typeof line.duration_ms === 'number' ? line.duration_ms : null;
  const agentId = line.agent_id || '';
  const taskId = line.task_id || '';

  // Colour the tool name line
  let toolLabel;
  if (line._error) {
    toolLabel = c.red(`[ERROR] ${toolName}`);
  } else if (dur !== null && dur >= HIGH_DURATION_THRESHOLD_MS) {
    toolLabel = c.yellow(`${toolName}  [SLOW: ${dur}ms]`);
  } else {
    toolLabel = c.green(toolName);
  }

  const durStr = dur !== null ? `${dur}ms` : c.dim('n/a');

  const lines = [
    `${c.bold(c.cyan(`#${index + 1}`))}  ${toolLabel}`,
    `  ${c.dim('time:')}    ${ts}`,
    `  ${c.dim('args:')}    ${argsHash}`,
    `  ${c.dim('result:')}  ${resultHash}`,
    `  ${c.dim('dur:')}     ${durStr}`,
  ];

  if (agentId) lines.push(`  ${c.dim('agent:')}   ${agentId}`);
  if (taskId) lines.push(`  ${c.dim('task:')}    ${taskId}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
${c.bold('trace-viewer')} — Inspect OTel GenAI trace JSONL files

${c.bold('USAGE')}
  pnpm trace:view <session-id> [options]
  node .claude/tools/cli/trace-viewer.cjs <session-id> [options]

${c.bold('OPTIONS')}
  --tool <name>          Filter by gen_ai.tool.name (substring)
  --agent <id>           Filter by agent_id (substring)
  --min-duration <ms>    Only show lines with duration_ms >= value
  --help, -h             Show this help

${c.bold('EXAMPLES')}
  pnpm trace:view sess-abc123
  pnpm trace:view sess-abc123 --tool Read
  pnpm trace:view sess-abc123 --agent developer --min-duration 200
`);
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!opts.sessionId) {
    console.error(c.red('Error: <session-id> is required.\n'));
    printHelp();
    process.exit(1);
  }

  const tracePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'context',
    'runtime',
    'traces',
    `${opts.sessionId}.jsonl`
  );

  if (!fs.existsSync(tracePath)) {
    console.error(c.red(`Error: trace file not found: ${tracePath}`));
    process.exit(1);
  }

  const raw = fs.readFileSync(tracePath, 'utf8');
  const allLines = raw
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try {
        return JSON.parse(l);
      } catch (_e) {
        return { _error: true, _raw: l, 'gen_ai.tool.name': '(parse error)' };
      }
    });

  const filtered = allLines.filter(l => matchesFilters(l, opts));

  if (filtered.length === 0) {
    console.log(c.dim('No trace lines match the given filters.'));
    process.exit(0);
  }

  // Header
  console.log(
    `\n${c.bold('Trace:')} ${c.cyan(opts.sessionId)}  ${c.dim(`(${filtered.length}/${allLines.length} lines)`)}\n`
  );

  for (let i = 0; i < filtered.length; i++) {
    console.log(formatLine(filtered[i], i));
    console.log(c.dim('  ' + '─'.repeat(50)));
  }

  console.log(`\n${c.dim(`Total: ${filtered.length} lines shown`)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, matchesFilters, formatLine, findProjectRoot };
