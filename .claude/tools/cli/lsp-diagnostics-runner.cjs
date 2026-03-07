#!/usr/bin/env node
// Agent: nodejs-pro | Task: #3 | Session: 2026-03-06
// @ts-check
/**
 * LSP Diagnostics Runner
 * ======================
 * Automated codebase health scanning using static analysis.
 * Finds dead exports, broken imports, and unreferenced functions.
 *
 * Usage:
 *   node lsp-diagnostics-runner.cjs [options]
 *
 * Options:
 *   --glob "pattern"              Files to scan (default: .claude/lib/**\/*.cjs)
 *   --check dead-exports          Find exports with 0 external references
 *   --check broken-imports        Find require() paths that don't resolve
 *   --check unreferenced-functions Find internal functions never called
 *   --format json|table|markdown  Output format (default: table)
 *   --output file.md              Write results to file
 *
 * @module tools/cli/lsp-diagnostics-runner
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Project root resolution
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
// Normalize paths to forward slashes (SE-01)
// ---------------------------------------------------------------------------
function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Ripgrep helper — shell: false, array args (security)
// ---------------------------------------------------------------------------
function rgSearch(pattern, globs, cwd, extraFlags) {
  const rgBin = findRgBin();
  const args = ['--no-heading', '--line-number', '-e', pattern];
  for (const g of globs) {
    args.push('--glob', g);
  }
  if (extraFlags) args.push(...extraFlags);

  try {
    const output = execFileSync(rgBin, args, {
      cwd: cwd || PROJECT_ROOT,
      shell: false,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
    return output.split('\n').filter(Boolean);
  } catch (err) {
    // rg exits 1 when no matches — that's OK
    if (err.status === 1) return [];
    return [];
  }
}

function findRgBin() {
  // Try @vscode/ripgrep first
  try {
    const vscRg = require('@vscode/ripgrep');
    if (vscRg && vscRg.rgPath) return vscRg.rgPath;
  } catch (_) {
    // fallthrough
  }
  // Fall back to system rg
  return 'rg';
}

// ---------------------------------------------------------------------------
// Expand glob pattern to matching file paths using rg --files
// Splits "base/path/**/*.ext" into searchDir + fileGlob filter
// ---------------------------------------------------------------------------
function expandGlob(globPattern) {
  const rgBin = findRgBin();

  // Split glob into base dir (no wildcards) and the filter portion
  const normalized = globPattern.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const baseParts = [];
  let filterStart = parts.length;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*') || parts[i].includes('?') || parts[i].includes('{')) {
      filterStart = i;
      break;
    }
    baseParts.push(parts[i]);
  }

  const searchDir = baseParts.length > 0 ? baseParts.join('/') : '.';
  const filterGlob = parts.slice(filterStart).join('/') || '**/*';
  const absSearchDir = path.resolve(PROJECT_ROOT, searchDir);

  if (!fs.existsSync(absSearchDir)) return [];

  const args = ['--files', '--glob', filterGlob, absSearchDir];
  try {
    const output = execFileSync(rgBin, args, {
      cwd: PROJECT_ROOT,
      shell: false,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
    return output
      .split('\n')
      .filter(Boolean)
      .map(f => path.resolve(PROJECT_ROOT, f));
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Check 1: Dead Exports
// Find module.exports / exports.X symbols not referenced elsewhere
// ---------------------------------------------------------------------------
function checkDeadExports(files) {
  const findings = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (_) {
      continue;
    }

    const relPath = normalizePath(path.relative(PROJECT_ROOT, filePath));
    const exportedNames = extractExportedNames(content);

    for (const name of exportedNames) {
      if (!name || name.length < 2) continue;

      // Search for references outside the defining file
      const refs = rgSearch(name, ['*.cjs', '*.mjs', '*.js', '*.ts', '*.md'], PROJECT_ROOT, [
        '--fixed-strings',
        '-l',
      ]);

      // Filter out self-references
      const externalRefs = refs.filter(r => {
        const normalized = normalizePath(r);
        return !normalized.endsWith(relPath) && !normalized.includes(relPath);
      });

      if (externalRefs.length === 0) {
        // Hook files export functions for testability (stdin/stdout protocol).
        // Their exports are used only in tests — mark as LOW, not MEDIUM.
        const isHookFile = relPath.includes('.claude/hooks/');
        findings.push({
          file: relPath,
          symbol: name,
          severity: name.startsWith('_') || isHookFile ? 'LOW' : 'MEDIUM',
          check: 'dead-exports',
        });
      }
    }
  }

  return findings;
}

// Extract named exports from CommonJS source
function extractExportedNames(content) {
  const names = new Set();

  // module.exports = { foo, bar }
  const objPattern = /module\.exports\s*=\s*\{([^}]+)\}/g;
  let m;
  while ((m = objPattern.exec(content)) !== null) {
    const inner = m[1];
    for (const part of inner.split(',')) {
      const kv = part.trim();
      // key: value or just key
      const key = kv.split(':')[0].trim().replace(/['"]/g, '');
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) names.add(key);
    }
  }

  // exports.foo = ...
  const namedPattern = /exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = namedPattern.exec(content)) !== null) {
    names.add(m[1]);
  }

  // module.exports.foo = ...
  const moduleNamedPattern = /module\.exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = moduleNamedPattern.exec(content)) !== null) {
    names.add(m[1]);
  }

  return [...names];
}

// ---------------------------------------------------------------------------
// Check 2: Broken Imports
// Find require() calls that don't resolve
// ---------------------------------------------------------------------------
function checkBrokenImports(files) {
  const findings = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (_) {
      continue;
    }

    const relPath = normalizePath(path.relative(PROJECT_ROOT, filePath));
    const requires = extractRequirePaths(content);

    for (const reqPath of requires) {
      // Only check relative imports (skip node built-ins and npm packages)
      if (!reqPath.startsWith('.')) continue;

      try {
        require.resolve(path.resolve(path.dirname(filePath), reqPath));
      } catch (_) {
        findings.push({
          file: relPath,
          symbol: reqPath,
          severity: 'HIGH',
          check: 'broken-imports',
        });
      }
    }
  }

  return findings;
}

// Extract all require() paths from source, skipping those inside string literals or comments.
// We strip line comments (//) and block comments (/* */) first, then strip string literals
// to avoid false positives from example code or documentation embedded in source files.
function extractRequirePaths(content) {
  const paths = [];

  // Remove block comments (/* ... */) — non-greedy, handles multiline
  let stripped = content.replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length));

  // Remove line comments (// ...) — replace with spaces to preserve character positions
  stripped = stripped.replace(/\/\/[^\n]*/g, match => ' '.repeat(match.length));

  // Remove string literals (single/double quoted, non-multiline) to avoid
  // false positives from require() paths inside example strings or docs.
  // Replace with placeholder of same length.
  stripped = stripped.replace(
    /"(?:[^"\\]|\\.)*"/g,
    match => '"' + ' '.repeat(match.length - 2) + '"'
  );
  stripped = stripped.replace(
    /'(?:[^'\\]|\\.)*'/g,
    match => "'" + ' '.repeat(match.length - 2) + "'"
  );

  // Now find actual require() calls
  const pattern = /require\(\s*(['"`])([^'"` ]+)\1\s*\)/g;
  let m;
  while ((m = pattern.exec(stripped)) !== null) {
    paths.push(m[2]);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Check 3: Unreferenced Functions
// Find named functions not called anywhere in the codebase
// ---------------------------------------------------------------------------
function checkUnreferencedFunctions(files) {
  const findings = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (_) {
      continue;
    }

    const relPath = normalizePath(path.relative(PROJECT_ROOT, filePath));
    const functions = extractFunctionNames(content);

    for (const name of functions) {
      if (!name || name.length < 3) continue;
      // Skip common framework/lifecycle names likely called externally
      if (['main', 'init', 'setup', 'run', 'start', 'stop', 'close'].includes(name)) continue;

      const refs = rgSearch(name, ['*.cjs', '*.mjs', '*.js', '*.ts'], PROJECT_ROOT, [
        '--fixed-strings',
        '-l',
      ]);

      // Self-reference (definition file) always counts as 1
      // If only the defining file references the name, it might be unreferenced
      const externalRefs = refs.filter(r => {
        const normalized = normalizePath(r);
        return !normalized.endsWith(relPath) && !normalized.includes(relPath);
      });

      // Also count internal calls within the same file
      const internalCallCount = (content.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;
      const definitionCount = (content.match(new RegExp(`function\\s+${name}\\b`, 'g')) || [])
        .length;

      if (externalRefs.length === 0 && internalCallCount <= definitionCount) {
        findings.push({
          file: relPath,
          symbol: name,
          severity: 'LOW',
          check: 'unreferenced-functions',
        });
      }
    }
  }

  return findings;
}

// Extract named function declarations and named arrow functions
function extractFunctionNames(content) {
  const names = new Set();

  // function foo(...)
  const funcDecl = /^(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
  let m;
  while ((m = funcDecl.exec(content)) !== null) {
    names.add(m[1]);
  }

  // const foo = (...) =>  /  const foo = function(
  const arrowOrExpr =
    /\bconst\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)/g;
  while ((m = arrowOrExpr.exec(content)) !== null) {
    names.add(m[1]);
  }

  return [...names];
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------
const DATE_STR = new Date().toISOString().split('T')[0];

function formatTable(findings) {
  if (findings.length === 0) return `  (none found)\n`;

  const colWidths = [50, 35, 8];
  const header = ['File', 'Symbol', 'Severity'];
  const sep = colWidths.map(w => '─'.repeat(w));

  const lines = [];
  lines.push(`┌${sep.map(s => s).join('┬')}┐`);
  lines.push(`│${header.map((h, i) => h.padEnd(colWidths[i])).join('│')}│`);
  lines.push(`├${sep.map(s => s).join('┼')}┤`);

  for (const f of findings) {
    const row = [
      truncate(f.file, colWidths[0]),
      truncate(f.symbol, colWidths[1]),
      f.severity.padEnd(colWidths[2]),
    ];
    lines.push(`│${row.map((c, i) => c.padEnd(colWidths[i])).join('│')}│`);
  }

  lines.push(`└${sep.map(s => s).join('┴')}┘`);
  return lines.join('\n') + '\n';
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return '...' + str.slice(str.length - (max - 3));
}

function buildReport(allFindings, format) {
  const groups = {};
  for (const f of allFindings) {
    if (!groups[f.check]) groups[f.check] = [];
    groups[f.check].push(f);
  }

  const checkTitles = {
    'dead-exports': 'DEAD EXPORTS (exported but never imported externally)',
    'broken-imports': 'BROKEN IMPORTS (require paths that do not resolve)',
    'unreferenced-functions': 'UNREFERENCED FUNCTIONS (defined but never called)',
  };

  if (format === 'json') {
    return JSON.stringify({ date: DATE_STR, findings: allFindings }, null, 2);
  }

  if (format === 'markdown') {
    const lines = [`# LSP Diagnostics Report — ${DATE_STR}`, ''];
    for (const [check, items] of Object.entries(groups)) {
      lines.push(`## ${checkTitles[check] || check}`);
      lines.push('');
      if (items.length === 0) {
        lines.push('_(none found)_');
      } else {
        lines.push('| File | Symbol | Severity |');
        lines.push('|------|--------|----------|');
        for (const f of items) {
          lines.push(`| \`${f.file}\` | \`${f.symbol}\` | ${f.severity} |`);
        }
      }
      lines.push('');
    }
    lines.push(`**Total findings: ${allFindings.length}**`);
    return lines.join('\n');
  }

  // Default: table
  const lines = [`LSP Diagnostics Report — ${DATE_STR}`, '='.repeat(45), ''];
  for (const [check, items] of Object.entries(groups)) {
    lines.push(`${checkTitles[check] || check}:`);
    lines.push(formatTable(items));
  }
  lines.push(`Total findings: ${allFindings.length}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    glob: '.claude/lib/**/*.cjs',
    checks: [],
    format: 'table',
    output: null,
    excludePattern: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--glob' && args[i + 1]) {
      opts.glob = args[++i];
    } else if (args[i] === '--check' && args[i + 1]) {
      opts.checks.push(args[++i]);
    } else if (args[i] === '--format' && args[i + 1]) {
      opts.format = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      opts.output = args[++i];
    } else if (args[i] === '--exclude-pattern' && args[i + 1]) {
      opts.excludePattern = args[++i];
    }
  }

  // Default: run all checks if none specified
  if (opts.checks.length === 0) {
    opts.checks = ['dead-exports', 'broken-imports', 'unreferenced-functions'];
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);

  process.stderr.write(`[lsp-diagnostics] Scanning: ${opts.glob}\n`);
  process.stderr.write(`[lsp-diagnostics] Checks: ${opts.checks.join(', ')}\n`);
  if (opts.excludePattern) {
    process.stderr.write(`[lsp-diagnostics] Excluding: ${opts.excludePattern}\n`);
  }

  // NOTE: Hook files (.claude/hooks/**) export functions for testability but are invoked
  // via stdin/stdout protocol, not require(). Their exports are used in test suites only.
  // Dead-export findings for hook files are reported as LOW severity, not MEDIUM.
  // Use --exclude-pattern "_archive" to filter out archived directories from results.

  let files = expandGlob(opts.glob);

  // Apply exclude-pattern filter (e.g. --exclude-pattern "_archive")
  if (opts.excludePattern) {
    const normalizedExclude = opts.excludePattern.replace(/\\/g, '/');
    files = files.filter(f => !normalizePath(f).includes(normalizedExclude));
    process.stderr.write(`[lsp-diagnostics] After exclude filter: ${files.length} files\n`);
  } else {
    process.stderr.write(`[lsp-diagnostics] Found ${files.length} files\n`);
  }

  if (files.length === 0) {
    process.stderr.write('[lsp-diagnostics] No files matched. Exiting.\n');
    process.exit(0);
  }

  const allFindings = [];

  if (opts.checks.includes('dead-exports')) {
    process.stderr.write('[lsp-diagnostics] Running dead-exports check...\n');
    const found = checkDeadExports(files);
    process.stderr.write(`[lsp-diagnostics] dead-exports: ${found.length} findings\n`);
    allFindings.push(...found);
  }

  if (opts.checks.includes('broken-imports')) {
    process.stderr.write('[lsp-diagnostics] Running broken-imports check...\n');
    const found = checkBrokenImports(files);
    process.stderr.write(`[lsp-diagnostics] broken-imports: ${found.length} findings\n`);
    allFindings.push(...found);
  }

  if (opts.checks.includes('unreferenced-functions')) {
    process.stderr.write('[lsp-diagnostics] Running unreferenced-functions check...\n');
    const found = checkUnreferencedFunctions(files);
    process.stderr.write(`[lsp-diagnostics] unreferenced-functions: ${found.length} findings\n`);
    allFindings.push(...found);
  }

  const report = buildReport(allFindings, opts.format);

  if (opts.output) {
    const outPath = path.resolve(PROJECT_ROOT, opts.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report, 'utf-8');
    process.stderr.write(`[lsp-diagnostics] Report written to: ${outPath}\n`);
  } else {
    process.stdout.write(report + '\n');
  }

  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[lsp-diagnostics] Fatal error: ${err.message}\n`);
  process.exit(1);
});
