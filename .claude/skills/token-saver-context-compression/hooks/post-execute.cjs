#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../../lib/utils/project-root.cjs');

const REPORT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'token-saver-context-compression-last.json'
);

function parseInput() {
  try {
    return JSON.parse(process.argv[2] || '{}');
  } catch {
    return {};
  }
}

function main() {
  const payload = parseInput();
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        payload,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
