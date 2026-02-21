#!/usr/bin/env node
/**
 * Reduce debug log files by keeping only issue lines and deduping repeats.
 *
 *   pnpm reduce-debug-log -- <file> [file ...] [--dry-run] [--output path]
 *   pnpm reduce-debug-log --help
 *
 * Keeps: [ERROR], [WARN], error/fail/BLOCKED/timeout/exception messages, stack traces.
 * Removes: benign timeouts, hook plumbing, JSON dumps, stderr banners.
 * Dedupes: consecutive identical lines are collapsed to one.
 */

import fs from 'node:fs';
import path from 'node:path';

const USAGE = `
Usage: node scripts/reduce-debug-log.mjs <file> [file ...] [options]
       pnpm reduce-debug-log -- .tmp/session-abc.txt

Options:
  --help       Show this message.
  --dry-run    Print stats only, do not write.
  --output F   Write result to F instead of overwriting (single file only).
  --in-place   Overwrite the input file(s) (default when no --output).

Examples:
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
  return KEEP_PATTERNS.some((re) => re.test(line));
}

function removeLine(line) {
  return REMOVE_PATTERNS.some((re) => re.test(line));
}

function reduceLines(lines) {
  const kept = lines.filter((line) => keepLine(line));
  const filtered = kept.filter((line) => !removeLine(line));
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

  console.log(path.relative(process.cwd(), absolutePath) + ':');
  console.log('  input:', lines.length, 'lines → kept (issue-like):', kept, '→ after noise removal:', filtered, '→ after dedupe:', reduced.length);

  if (opts.dryRun) {
    return true;
  }

  const outPath = opts.output ? path.resolve(opts.output) : absolutePath;
  fs.writeFileSync(outPath, out + (out && !out.endsWith('\n') ? '\n' : ''), 'utf8');
  if (outPath !== absolutePath) {
    console.log('  written to:', path.relative(process.cwd(), outPath));
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
  const files = args.filter((a) => !a.startsWith('--'));

  if (files.length === 0) {
    console.log(USAGE.trim());
    process.exit(1);
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
