#!/usr/bin/env node
/**
 * Reduce debug log files by keeping only issue lines and deduping repeats.
 *
 *   pnpm reduce-debug-log -- <file> [file ...] [--dry-run] [--output path]
 *   pnpm reduce-debug-log --help
 *   pnpm debug:reduce                     (auto-finds most recent debug log)
 *
 * Keeps: [ERROR], [WARN], error/fail/BLOCKED/timeout/exception messages, stack traces.
 * Removes: benign timeouts, hook plumbing, JSON dumps, stderr banners.
 * Dedupes: consecutive identical lines are collapsed to one.
 *
 * Auto-detect behavior (no source arg):
 *   1. Finds the most recent .txt file in ~/.claude/debug/
 *   2. Copies it to .tmp/<session-id>.txt in the project root
 *   3. Runs reduction on the .tmp copy
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const USAGE = `
Usage: node scripts/reduce-debug-log.mjs [<file>] [options]
       pnpm reduce-debug-log -- .tmp/session-abc.txt
       pnpm debug:reduce                  (auto-detect most recent debug log)

Options:
  --help       Show this message.
  --dry-run    Print stats only, do not write.
  --output F   Write result to F instead of overwriting (single file only).
  --in-place   Overwrite the input file(s) (default when no --output).

Auto-detect behavior (no source arg):
  Finds the most recent .txt in ~/.claude/debug/, copies it to .tmp/<name>.txt,
  then reduces the copy. The source and destination paths are printed clearly.

Examples:
  pnpm debug:reduce
  pnpm reduce-debug-log -- .tmp/3c54f5ed-c0b8-439f-a679-0d0b9750a110.txt
  pnpm reduce-debug-log -- .tmp/*.txt --dry-run
  pnpm reduce-debug-log -- .tmp/session.txt --output .tmp/session.cleaned.txt
`;

// Lines to KEEP (issue-like)
const KEEP_PATTERNS = [
  /\[ERROR\]/,
  /\[WARN\]/,
  /error:/i,
  /\bError:/,
  /failed/i,
  /\bFailed\b/,
  /BLOCKED/,
  /blocked by/i,
  /Exception/,
  /timeout/i,
  /Timeout/,
  /File does not exist/,
  /exceeds maximum/,
  /AbortError/,
  /authentication_error/,
  /PostToolUseFailure/,
  /MaxFileReadTokenExceededError/,
  /FileTooLargeError/,
  /^\s+at\s+/,
  /"level":\s*"error"/,
  /"event":\s*"main_rejected"/,
  /"event":\s*"module_load_failed"/,
  /SyntaxError:/,
];

// Lines to REMOVE (noise) — applied after keep
const REMOVE_PATTERNS = [
  /Starting connection with timeout of \d+ms/,
  /HTTP transport options:.*timeoutMs/,
  /Getting matching hook commands for PostToolUseFailure/,
  /Hooks: Checking initial response for async:/,
  /Hooks: Parsed initial response:/,
  /Successfully parsed and validated hook JSON output/,
  /^\s+at\s+/, // stack traces (optional: remove to save space)
  /MCP server "sequential-thinking" Server stderr: Sequential Thinking MCP Server running/,
  /MCP server "filesystem" Server stderr: Usage: mcp-server-filesystem/,
  /MCP server "chrome-devtools" Server stderr: chrome-devtools-mcp exposes/,
  /^\s*\{/, // standalone JSON payload lines
];

function keepLine(line) {
  return KEEP_PATTERNS.some(re => re.test(line));
}

function removeLine(line) {
  // Never remove JSON payloads that represent errors
  if (
    /^\s*\{/.test(line) &&
    (line.includes('"level":"error"') ||
      line.includes('"event":"main_rejected"') ||
      line.includes('"event":"module_load_failed"'))
  ) {
    return false;
  }
  return REMOVE_PATTERNS.some(re => re.test(line));
}

function reduceLines(lines) {
  const kept = lines.filter(line => keepLine(line));
  const filtered = kept.filter(line => !removeLine(line));
  const deduped = [];
  let prev = null;
  for (const line of filtered) {
    if (line !== prev) {
      deduped.push(line);
      prev = line;
    }
  }
  return { reduced: deduped, kept: kept.length, filtered: filtered.length };
}

/**
 * Find the most recent .txt file in ~/.claude/debug/
 * @returns {string} absolute path to the most recent debug log
 */
function findMostRecentDebugLog() {
  const debugDir = path.join(os.homedir(), '.claude', 'debug');
  if (!fs.existsSync(debugDir)) {
    throw new Error(`Debug directory not found: ${debugDir}`);
  }
  const files = fs
    .readdirSync(debugDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(debugDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    throw new Error(`No debug logs found in ${debugDir}`);
  }
  return path.join(debugDir, files[0].name);
}

/**
 * Copy a file to .tmp/<basename> in the project root.
 * @param {string} sourcePath absolute path to source file
 * @returns {string} absolute path to the copied file in .tmp/
 */
function copyToTmp(sourcePath) {
  // Use the directory of this script's parent (project root) when invoked via pnpm
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const tmpDir = path.join(projectRoot, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const sessionId = path.basename(sourcePath);
  const destPath = path.join(tmpDir, sessionId);
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}

function reduceFile(filePath, opts) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error('File not found:', absolutePath);
    return false;
  }
  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const { reduced, kept, filtered } = reduceLines(lines);
  const out = reduced.join('\n');

  const pct =
    lines.length > 0 ? (((lines.length - reduced.length) / lines.length) * 100).toFixed(1) : '0.0';

  console.log(`📊 Reducing ${lines.length} lines...`);
  console.log(
    '  input:',
    lines.length,
    'lines → kept (issue-like):',
    kept,
    '→ after noise removal:',
    filtered,
    '→ after dedupe:',
    reduced.length
  );
  console.log(`✅ Reduced to ${reduced.length} lines (${pct}% reduction)`);

  if (opts.dryRun) {
    return true;
  }

  const outPath = opts.output ? path.resolve(opts.output) : absolutePath;
  fs.writeFileSync(outPath, out + (out && !out.endsWith('\n') ? '\n' : ''), 'utf8');
  console.log(`📄 Output: ${outPath}`);
  if (outPath !== path.resolve(filePath)) {
    console.log('  (written to:', path.relative(process.cwd(), outPath) + ')');
  }
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE.trim());
    process.exit(0);
  }
  const dryRun = args.includes('--dry-run') && args.splice(args.indexOf('--dry-run'), 1).length;
  const outputIdx = args.indexOf('--output');
  let outputPath = null;
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = args[outputIdx + 1];
    args.splice(outputIdx, 2);
  }
  const inPlaceIdx = args.indexOf('--in-place');
  if (inPlaceIdx !== -1) args.splice(inPlaceIdx, 1);
  const files = args.filter(a => !a.startsWith('--'));

  // Auto-detect most recent debug log when no source file is provided
  if (files.length === 0) {
    let sourcePath;
    try {
      sourcePath = findMostRecentDebugLog();
    } catch (err) {
      console.error('Error auto-detecting debug log:', err.message);
      console.log(USAGE.trim());
      process.exit(1);
    }

    console.log(`🔍 Auto-detected debug log: ${sourcePath}`);

    let workingPath;
    try {
      workingPath = copyToTmp(sourcePath);
    } catch (err) {
      console.error('Error copying to .tmp:', err.message);
      process.exit(1);
    }

    console.log(`📋 Copied to: ${workingPath}`);

    // Default output: same dir as working copy with -reduced suffix
    if (!outputPath) {
      const ext = path.extname(workingPath);
      const base = path.basename(workingPath, ext);
      outputPath = path.join(path.dirname(workingPath), `${base}-reduced${ext}`);
    }

    const opts = { dryRun, output: outputPath };
    const ok = reduceFile(workingPath, opts);
    process.exit(ok ? 0 : 1);
  }

  if (outputPath && files.length > 1) {
    console.error('--output is only supported with a single input file.');
    process.exit(1);
  }

  const opts = { dryRun, output: outputPath || null };

  let ok = true;
  for (const f of files) {
    if (!reduceFile(f, opts)) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

main();
