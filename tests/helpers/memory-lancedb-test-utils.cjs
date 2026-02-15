'use strict';

const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '../lib/memory/.test-lancedb');
const TEST_DB_PATH = path.join(TEST_DIR, 'test-lancedb');

function setupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getModule() {
  const modulePath = require.resolve('../../.claude/lib/memory/lancedb-client.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

module.exports = {
  TEST_DIR,
  TEST_DB_PATH,
  setupTestDir,
  cleanupTestDir,
  getModule,
};
