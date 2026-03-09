#!/usr/bin/env node
'use strict';

/**
 * security-architect - Dispatcher Script
 * Routes --action flags to specific handler functions.
 * All child_process calls use shell: false (SE-02 security requirement).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments into an options object.
 * Supports: --action <name>, --output <path>, --format <fmt>, --help, --list
 * @returns {{ action?: string, output?: string, format?: string, help?: boolean, list?: boolean }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      const value = next && !next.startsWith('--') ? ((i += 1), next) : true;
      options[key] = value;
    }
  }
  return options;
}

// ---------------------------------------------------------------------------
// Action: audit
// ---------------------------------------------------------------------------

/**
 * Run `pnpm audit --json` and return structured findings.
 * Uses shell: false to prevent command injection (SE-02).
 * @param {{ cwd?: string }} opts
 * @returns {{ vulnerabilities: Array<{ severity: string, package: string, advisory: string }>, raw: object|null, error?: string }}
 */
function runAudit(opts = {}) {
  const cwd = opts.cwd || process.cwd();

  const result = spawnSync('pnpm', ['audit', '--json'], {
    shell: false,
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024, // 10 MB
  });

  if (result.error) {
    return {
      vulnerabilities: [],
      raw: null,
      error: `pnpm audit failed to spawn: ${result.error.message}`,
    };
  }

  const output = (result.stdout || '').trim();
  if (!output) {
    const stderr = (result.stderr || '').trim();
    return {
      vulnerabilities: [],
      raw: null,
      error: stderr || 'pnpm audit produced no output',
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(output);
  } catch (_err) {
    return {
      vulnerabilities: [],
      raw: null,
      error: `Failed to parse pnpm audit JSON: ${_err.message}`,
    };
  }

  const vulnerabilities = [];

  // pnpm audit --json uses npm-compatible structure with `advisories` map
  const advisories = parsed.advisories || {};
  for (const [, advisory] of Object.entries(advisories)) {
    const findings = advisory.findings || [];
    for (const finding of findings) {
      const paths = finding.paths || [advisory.module_name || 'unknown'];
      for (const pkg of paths) {
        vulnerabilities.push({
          severity: advisory.severity || 'unknown',
          package: pkg,
          advisory: advisory.title || advisory.url || String(advisory.id),
        });
      }
    }
  }

  return { vulnerabilities, raw: parsed };
}

// ---------------------------------------------------------------------------
// Action: scan
// ---------------------------------------------------------------------------

/**
 * Check if a command is available on PATH.
 * Uses shell: false to avoid injection (SE-02).
 * @param {string} cmd
 * @returns {boolean}
 */
function isCommandAvailable(cmd) {
  const check = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    shell: false,
    encoding: 'utf8',
  });
  return check.status === 0;
}

/**
 * Run semgrep if available, otherwise fall back to pnpm audit.
 * @param {{ cwd?: string, semgrepConfig?: string }} opts
 * @returns {{ tool: string, findings: Array<object>, error?: string }}
 */
function runScan(opts = {}) {
  const cwd = opts.cwd || process.cwd();

  if (isCommandAvailable('semgrep')) {
    const semgrepArgs = ['--json', '--quiet'];
    if (opts.semgrepConfig) {
      semgrepArgs.push('--config', opts.semgrepConfig);
    } else {
      semgrepArgs.push('--config', 'auto');
    }
    semgrepArgs.push('.');

    const result = spawnSync('semgrep', semgrepArgs, {
      shell: false,
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024, // 20 MB
      windowsHide: true,
    });

    if (result.error) {
      // semgrep spawn error — fall through to pnpm audit
    } else {
      const output = (result.stdout || '').trim();
      let parsed = null;
      try {
        parsed = output ? JSON.parse(output) : { results: [] };
      } catch (_err) {
        // parse error — fall through
        parsed = null;
      }

      if (parsed !== null) {
        const findings = (parsed.results || []).map(r => ({
          rule: r.check_id || r.rule_id || 'unknown',
          severity: (r.extra && r.extra.severity) || 'unknown',
          file: r.path || 'unknown',
          line: r.start && r.start.line,
          message: (r.extra && r.extra.message) || r.message || '',
        }));
        return { tool: 'semgrep', findings };
      }
    }
  }

  // Fallback: pnpm audit
  const auditResult = runAudit({ cwd });
  return {
    tool: 'pnpm-audit',
    findings: auditResult.vulnerabilities.map(v => ({
      rule: 'dependency-vulnerability',
      severity: v.severity,
      package: v.package,
      message: v.advisory,
    })),
    error: auditResult.error,
  };
}

// ---------------------------------------------------------------------------
// Action: report
// ---------------------------------------------------------------------------

/**
 * Generate a markdown security findings report and write it to
 * .claude/context/reports/security/ (relative to projectRoot).
 * @param {{ findings: Array<object>, tool?: string, projectRoot?: string, outputPath?: string }} opts
 * @returns {{ reportPath: string }}
 */
function generateReport(opts = {}) {
  const { findings = [], tool = 'unknown', projectRoot = process.cwd() } = opts;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().replace('T', ' ').slice(0, 19);

  const reportsDir = path.join(projectRoot, '.claude', 'context', 'reports', 'security');
  fs.mkdirSync(reportsDir, { recursive: true });

  const filename = opts.outputPath || path.join(reportsDir, `security-scan-report-${dateStr}.md`);

  const severityCounts = {};
  for (const f of findings) {
    const sev = f.severity || 'unknown';
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
  }

  const severityOrder = ['critical', 'high', 'moderate', 'medium', 'low', 'info', 'unknown'];
  const summaryRows = severityOrder
    .filter(s => severityCounts[s] > 0)
    .map(s => `| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${severityCounts[s]} |`);

  const findingRows = findings.map((f, i) => {
    const pkg = f.package || f.file || 'N/A';
    const rule = f.rule || 'N/A';
    const sev = f.severity || 'unknown';
    const msg = (f.message || f.advisory || '').replace(/\|/g, '\\|').slice(0, 120);
    return `| ${i + 1} | ${sev} | ${pkg} | ${rule} | ${msg} |`;
  });

  const lines = [
    `<!-- Agent: developer | Task: #task-20 | Session: ${dateStr} -->`,
    `# Security Scan Report`,
    ``,
    `**Generated:** ${timeStr}  `,
    `**Tool:** ${tool}  `,
    `**Total findings:** ${findings.length}`,
    ``,
    `## Summary`,
    ``,
    `| Severity | Count |`,
    `| -------- | ----- |`,
    ...summaryRows,
    ``,
    `## Findings`,
    ``,
  ];

  if (findings.length === 0) {
    lines.push('_No findings reported._');
  } else {
    lines.push('| # | Severity | Package / File | Rule | Message |');
    lines.push('| - | -------- | -------------- | ---- | ------- |');
    lines.push(...findingRows);
  }

  lines.push('');

  fs.writeFileSync(filename, lines.join('\n'), 'utf8');

  return { reportPath: filename };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const ACTIONS = {
  audit: opts => {
    const result = runAudit({ cwd: opts.cwd });
    if (result.error) {
      process.stderr.write(`[security-architect] audit warning: ${result.error}\n`);
    }
    const count = result.vulnerabilities.length;
    process.stdout.write(
      JSON.stringify({ action: 'audit', count, vulnerabilities: result.vulnerabilities }, null, 2) +
        '\n'
    );
    if (count > 0) {
      process.exitCode = 1;
    }
  },

  scan: opts => {
    const result = runScan({ cwd: opts.cwd, semgrepConfig: opts.config });
    if (result.error) {
      process.stderr.write(`[security-architect] scan warning: ${result.error}\n`);
    }
    const count = result.findings.length;
    process.stdout.write(
      JSON.stringify(
        { action: 'scan', tool: result.tool, count, findings: result.findings },
        null,
        2
      ) + '\n'
    );
    if (count > 0) {
      process.exitCode = 1;
    }
  },

  report: opts => {
    // When called standalone: run scan first, then generate report
    const scanResult = runScan({ cwd: opts.cwd, semgrepConfig: opts.config });
    if (scanResult.error) {
      process.stderr.write(`[security-architect] scan warning: ${scanResult.error}\n`);
    }
    const { reportPath } = generateReport({
      findings: scanResult.findings,
      tool: scanResult.tool,
      projectRoot: opts.projectRoot || opts.cwd || process.cwd(),
      outputPath: opts.output || undefined,
    });
    process.stdout.write(
      JSON.stringify(
        { action: 'report', reportPath, findingsCount: scanResult.findings.length },
        null,
        2
      ) + '\n'
    );
  },
};

// ---------------------------------------------------------------------------
// Help / List
// ---------------------------------------------------------------------------

function showHelp() {
  process.stdout.write(`
security-architect - Enterprise Security Skill Dispatcher

Usage:
  node main.cjs --action <action> [options]
  node main.cjs --help
  node main.cjs --list

Actions:
  audit    Run pnpm audit --json and report dependency vulnerabilities
  scan     Run semgrep (if available) or fall back to pnpm audit
  report   Run scan and write a markdown report to .claude/context/reports/security/

Options:
  --action <name>   Action to execute (audit|scan|report)
  --output <path>   Override output report path (for report action)
  --config <name>   Semgrep config name (default: auto)
  --cwd <path>      Working directory (default: process.cwd())
  --help            Show this help message
  --list            List available actions

Security:
  All child_process calls use shell: false (SE-02 compliance).
  Uses pnpm audit and optionally semgrep for vulnerability detection.

Examples:
  node main.cjs --action audit
  node main.cjs --action scan
  node main.cjs --action report --output /tmp/security-report.md
`);
}

function showList() {
  process.stdout.write('Available actions for security-architect:\n');
  for (const name of Object.keys(ACTIONS)) {
    process.stdout.write(`  - ${name}\n`);
  }
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.list) {
    showList();
    process.exit(0);
  }

  const action = options.action;
  if (!action) {
    process.stderr.write(
      '[security-architect] Error: --action is required. Use --help for usage.\n'
    );
    process.exit(1);
  }

  const handler = ACTIONS[action];
  if (!handler) {
    process.stderr.write(
      `[security-architect] Error: unknown action "${action}". Use --list to see available actions.\n`
    );
    process.exit(1);
  }

  handler({
    cwd: options.cwd || process.cwd(),
    output: options.output,
    config: options.config,
    projectRoot: options.cwd || process.cwd(),
  });
}

// Only run when executed directly (not when require()'d by tests)
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { parseArgs, runAudit, runScan, generateReport, ACTIONS };
