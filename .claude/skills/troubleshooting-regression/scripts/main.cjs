#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? next : true;
    if (hasValue) i++;
  }
  return options;
}

function resolveDebugDir() {
  const home = process.env.USERPROFILE || os.homedir();
  return path.join(home, '.claude', 'debug');
}

function findLatestLog(debugDir) {
  if (!fs.existsSync(debugDir)) return null;
  const entries = fs
    .readdirSync(debugDir)
    .filter(name => name.toLowerCase().endsWith('.txt'))
    .map(name => {
      const full = path.join(debugDir, name);
      const stat = fs.statSync(full);
      return { full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return entries.length ? entries[0].full : null;
}

function classifyLine(line) {
  const checks = [
    {
      id: 'task_stall',
      severity: 'high',
      pattern: /running in the background|wave\s+\d+ agents are working/i,
      owner: '.claude/hooks/routing/pre-task-unified.cjs',
      action:
        'Verify Task/TaskUpdate lifecycle writes and completion propagation in pre/post task hooks.',
    },
    {
      id: 'search_first',
      severity: 'medium',
      pattern: /\[SEARCH-FIRST\]|read blocked until search evidence/i,
      owner: '.claude/hooks/routing/pre-tool-unified.read-safety.cjs',
      action:
        'Run hybrid search first (`pnpm search:code`) and ensure search evidence is recorded.',
    },
    {
      id: 'memory_first',
      severity: 'medium',
      pattern: /\[MEMORY-FIRST\]|memory review required before task spawn/i,
      owner: '.claude/hooks/routing/pre-task-unified-core.cjs',
      action:
        'Require memory baseline read (`patterns.json` + `gotchas.json`) before spawning parallel agents.',
    },
    {
      id: 'token_saver_gate',
      severity: 'medium',
      pattern: /\[TOKEN-SAVER\]|token saver required|context pressure/i,
      owner: '.claude/hooks/routing/user-prompt-unified.core.cjs',
      action: 'Invoke token-saver-context-compression when context pressure threshold triggers.',
    },
    {
      id: 'hook_error',
      severity: 'high',
      pattern: /\[ERROR\].*hook/i,
      owner: '.claude/hooks/',
      action: 'Inspect failing hook stack and add regression test for the exact blocked path.',
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(line)) {
      return {
        id: check.id,
        severity: check.severity,
        message: line.trim(),
        owner: check.owner,
        action: check.action,
      };
    }
  }
  return null;
}

function isIgnorableLine(line) {
  return /mcp|oauth|auth|credentials|connector/i.test(line);
}

function analyzeLog(logText) {
  const lines = String(logText || '').split(/\r?\n/);
  const findings = [];
  for (const line of lines) {
    if (!line || isIgnorableLine(line)) continue;
    const finding = classifyLine(line);
    if (finding) findings.push(finding);
  }

  const deduped = [];
  const seen = new Set();
  for (const finding of findings) {
    const key = `${finding.id}:${finding.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function buildNextActions(findings) {
  if (!findings.length) {
    return [
      'No framework regressions detected in analyzed log (excluding MCP noise).',
      'Run one additional prompt from troubleshooting matrix to confirm stability.',
    ];
  }

  const actions = [];
  for (const finding of findings) {
    actions.push(`${finding.id}: ${finding.action}`);
  }
  actions.push(
    'After patching, run targeted tests and a fresh debug session to verify non-reproduction.'
  );
  return Array.from(new Set(actions));
}

function maybeRunPrompt(prompt) {
  if (!prompt) return null;
  const proc = spawnSync('claude', ['-p', String(prompt), '-d'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 180000,
  });
  return {
    status: proc.status,
    stdoutTail: String(proc.stdout || '').slice(-2000),
    stderrTail: String(proc.stderr || '').slice(-2000),
  };
}

function main(input = {}) {
  const prompt = input.prompt ? String(input.prompt) : '';
  const strict = Boolean(input.strict);
  const explicitPath = input.logPath ? String(input.logPath) : '';
  const debugDir = resolveDebugDir();

  const runResult = maybeRunPrompt(prompt);
  const logPath = explicitPath || findLatestLog(debugDir);
  if (!logPath || !fs.existsSync(logPath)) {
    return {
      ok: false,
      error: `No debug log found. Expected under ${debugDir}`,
      logPath: logPath || null,
    };
  }

  const text = fs.readFileSync(logPath, 'utf8');
  const findings = analyzeLog(text);
  const criticalCount = findings.filter(item => item.severity === 'high').length;

  const result = {
    ok: !(strict && criticalCount > 0),
    logPath,
    totalFindings: findings.length,
    criticalFindings: criticalCount,
    findings,
    nextActions: buildNextActions(findings),
    runResult,
  };

  if (!result.ok) {
    result.error = 'Strict mode failed due to high-severity findings.';
  }

  return result;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      'Usage: node .claude/skills/troubleshooting-regression/scripts/main.cjs [--prompt "..."] [--log-path <path>] [--strict]\n'
    );
    process.exit(0);
  }

  const result = main({
    prompt: options.prompt,
    logPath: options['log-path'] || options.logPath,
    strict: options.strict === true || options.strict === 'true',
  });

  if (!result.ok) {
    process.stderr.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(String(error && error.message ? error.message : error) + '\n');
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  analyzeLog,
  buildNextActions,
  findLatestLog,
  resolveDebugDir,
};
