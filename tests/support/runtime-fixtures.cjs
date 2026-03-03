'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempProjectRuntime(prefix = 'runtime-fixture-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const runtime = path.join(root, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  return { root, runtime };
}

function cleanupTempRoot(root) {
  if (!root) return;
  fs.rmSync(root, { recursive: true, force: true });
}

function writeJsonl(filePath, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const lines = list.map(entry => `${JSON.stringify(entry)}\n`).join('');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines, 'utf8');
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

module.exports = {
  createTempProjectRuntime,
  cleanupTempRoot,
  writeJsonl,
  readJsonl,
};
