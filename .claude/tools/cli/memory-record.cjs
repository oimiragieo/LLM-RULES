#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  recordPattern,
  recordGotcha,
  getMemoryDir,
} = require('../../lib/memory/memory-manager.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { type: null, text: null, category: null, area: null, json: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--type') {
      result.type = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--text') {
      result.text = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--category') {
      result.category = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--area') {
      result.area = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--json') {
      result.json = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--project-root') {
      result.projectRoot = args[i + 1];
      i += 1;
      continue;
    }
    if (!result.type) {
      result.type = arg;
      continue;
    }
    if (!result.text) {
      result.text = arg;
    }
  }

  return result;
}

function readJsonPayload(input) {
  if (!input) return null;
  if (fs.existsSync(input)) {
    return safeParseJSON(fs.readFileSync(input, 'utf8'));
  }
  return safeParseJSON(input);
}

function recordMemory({ type, text, category, area, payload, projectRoot = PROJECT_ROOT }) {
  const normalizedType = String(type || '').toLowerCase();
  if (!['pattern', 'gotcha'].includes(normalizedType)) {
    throw new Error('Type must be pattern or gotcha.');
  }

  const entry = payload || { text, category, area };
  if (!entry || !entry.text) {
    throw new Error('Text is required to record memory.');
  }

  const added =
    normalizedType === 'pattern'
      ? recordPattern(entry, projectRoot)
      : recordGotcha(entry, projectRoot);

  const memoryDir = getMemoryDir(projectRoot);
  const targetFile = path.join(
    memoryDir,
    normalizedType === 'pattern' ? 'patterns.json' : 'gotchas.json'
  );

  return {
    added,
    type: normalizedType,
    file: targetFile,
  };
}

function printHelp() {
  console.log('Usage: node .claude/tools/cli/memory-record.cjs <pattern|gotcha> text [options]');
  console.log('');
  console.log('Options:');
  console.log('  --type <pattern|gotcha>    Explicit type (optional)');
  console.log('  --text <text>              Memory text (optional if positional used)');
  console.log('  --category <category>      Category tag');
  console.log('  --area <area>              Area (main, fragments, solutions)');
  console.log('  --json <path|json>          JSON payload with text/category/area');
  console.log('  --project-root <path>       Project root override');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const payload = args.json ? readJsonPayload(args.json) : null;
  const result = recordMemory({
    type: args.type,
    text: args.text,
    category: args.category,
    area: args.area,
    payload,
    projectRoot: args.projectRoot || PROJECT_ROOT,
  });

  const status = result.added ? 'Recorded' : 'Skipped (duplicate)';
  console.log(`${status} in ${result.file}`);
}

const wrappedMain = wrapCLITool(main, 'memory-record');

if (require.main === module) {
  wrappedMain();
}

module.exports = { recordMemory };
