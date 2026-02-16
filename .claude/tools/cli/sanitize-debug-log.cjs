#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { sanitizeForLogging } = require('../../lib/utils/error-sanitizer.cjs');

function getDebugDir() {
  return (
    process.env.CLAUDE_DEBUG_DIR ||
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'debug')
  );
}

function getLatestDebugLog(debugDir) {
  if (!fs.existsSync(debugDir)) return null;
  const files = fs
    .readdirSync(debugDir)
    .filter(f => f.endsWith('.txt'))
    .map(file => {
      const fullPath = path.join(debugDir, file);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.fullPath || null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    target: null,
    all: false,
    inPlace: false,
  };

  for (const arg of args) {
    if (arg === '--all') {
      opts.all = true;
    } else if (arg === '--in-place') {
      opts.inPlace = true;
    } else if (!arg.startsWith('-') && !opts.target) {
      opts.target = arg;
    }
  }

  return opts;
}

function sanitizeFile(filePath, inPlace) {
  const original = fs.readFileSync(filePath, 'utf8');
  const sanitized = sanitizeForLogging(original);

  if (inPlace) {
    fs.writeFileSync(filePath, sanitized, 'utf8');
    return { filePath, outputPath: filePath, changed: original !== sanitized };
  }

  const outputPath = filePath.replace(/\.txt$/i, '.sanitized.txt');
  fs.writeFileSync(outputPath, sanitized, 'utf8');
  return { filePath, outputPath, changed: original !== sanitized };
}

function main() {
  const opts = parseArgs(process.argv);
  const debugDir = getDebugDir();

  let targets = [];
  if (opts.target) {
    const resolved = path.resolve(opts.target);
    if (!fs.existsSync(resolved)) {
      console.error(`Target not found: ${resolved}`);
      process.exit(1);
      return;
    }
    targets = [resolved];
  } else if (opts.all) {
    if (!fs.existsSync(debugDir)) {
      console.error(`Debug directory not found: ${debugDir}`);
      process.exit(1);
      return;
    }
    targets = fs
      .readdirSync(debugDir)
      .filter(f => f.endsWith('.txt'))
      .map(f => path.join(debugDir, f));
  } else {
    const latest = getLatestDebugLog(debugDir);
    if (!latest) {
      console.error(`No debug logs found in: ${debugDir}`);
      process.exit(1);
      return;
    }
    targets = [latest];
  }

  let changedCount = 0;
  for (const target of targets) {
    const result = sanitizeFile(target, opts.inPlace);
    if (result.changed) changedCount += 1;
    console.log(
      `${result.changed ? 'sanitized' : 'no-change'}: ${result.filePath} -> ${result.outputPath}`
    );
  }

  console.log(`processed=${targets.length} changed=${changedCount} inPlace=${opts.inPlace}`);
}

const wrappedMain = wrapCLITool(main, 'sanitize-debug-log');

if (require.main === module) {
  wrappedMain();
}
