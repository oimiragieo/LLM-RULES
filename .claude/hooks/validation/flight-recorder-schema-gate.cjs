#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_FLIGHT_RECORDER_PATH = path.join(
  process.cwd(),
  '.claude',
  'context',
  'metrics',
  'flight-recorder.jsonl'
);

function isStrictEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.FLIGHT_RECORDER_SCHEMA_GATE_STRICT || '');
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function validateRow(row, lineNumber) {
  let parsed;
  try {
    parsed = JSON.parse(row);
  } catch (error) {
    return [`line ${lineNumber}: malformed JSON (${error.message})`];
  }

  const issues = [];
  for (const field of ['traceId', 'component', 'event', 'timestamp']) {
    if (typeof parsed[field] !== 'string' || parsed[field].trim() === '') {
      issues.push(`line ${lineNumber}: missing required string field "${field}"`);
    }
  }

  if (
    typeof parsed.timestamp === 'string' &&
    parsed.timestamp.trim() !== '' &&
    Number.isNaN(Date.parse(parsed.timestamp))
  ) {
    issues.push(`line ${lineNumber}: invalid timestamp "${parsed.timestamp}"`);
  }

  return issues;
}

function main() {
  const filePath = process.env.FLIGHT_RECORDER_PATH || DEFAULT_FLIGHT_RECORDER_PATH;
  const strict = isStrictEnabled();
  const rows = readRows(filePath);

  const issues = [];
  rows.forEach((row, index) => {
    issues.push(...validateRow(row, index + 1));
  });

  if (issues.length === 0) {
    process.exit(0);
  }

  process.stderr.write(`${issues.join('\n')}\n`);
  process.exit(strict ? 2 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  validateRow,
};
