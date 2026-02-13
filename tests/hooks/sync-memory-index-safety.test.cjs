#!/usr/bin/env node
'use strict';

/**
 * Tests for sync-memory-index.cjs file safety guards
 * Tests that the hook handles missing files and directories gracefully
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('sync-memory-index file safety', () => {
  let tempDir;

  // Setup temp directory for each test
  function setup() {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-memory-test-'));
  }

  // Cleanup temp directory after each test
  function cleanup() {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  it('syncJsonMemory should not crash when file does not exist', () => {
    setup();
    try {
      const { syncJsonMemory } = require('../../.claude/hooks/memory/sync-memory-index.cjs');
      const nonExistentFile = path.join(tempDir, 'nonexistent.json');
      const dbPath = path.join(tempDir, 'memory.db');

      // Should not throw - should handle gracefully
      assert.doesNotThrow(() => {
        syncJsonMemory(nonExistentFile, dbPath);
      });
    } finally {
      cleanup();
    }
  });

  it('syncJsonMemory should not crash when path is a directory', () => {
    setup();
    try {
      const { syncJsonMemory } = require('../../.claude/hooks/memory/sync-memory-index.cjs');
      const dirPath = path.join(tempDir, 'patterns.json');
      fs.mkdirSync(dirPath); // Create directory with .json name
      const dbPath = path.join(tempDir, 'memory.db');

      // Should not throw - should handle EISDIR gracefully
      assert.doesNotThrow(() => {
        syncJsonMemory(dirPath, dbPath);
      });
    } finally {
      cleanup();
    }
  });

  // syncMarkdownMemory tests removed - function does not exist in sync-memory-index.cjs
  // Only syncJsonMemory is exported. Markdown memory syncing happens via different mechanism.

  it('valid JSON file should sync successfully', () => {
    setup();
    try {
      const { syncJsonMemory, ensureEntityDbInitialized } = require('../../.claude/hooks/memory/sync-memory-index.cjs');
      const jsonFile = path.join(tempDir, 'patterns.json');
      fs.writeFileSync(jsonFile, JSON.stringify([
        { name: 'test-pattern', description: 'A test pattern' }
      ]));
      const dbPath = path.join(tempDir, 'memory.db');

      // Initialize DB first
      ensureEntityDbInitialized(dbPath);

      // Should not throw for valid file
      assert.doesNotThrow(() => {
        syncJsonMemory(jsonFile, dbPath);
      });
    } finally {
      cleanup();
    }
  });
});
