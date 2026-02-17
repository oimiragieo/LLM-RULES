#!/usr/bin/env node
/**
 * Tests for P2a: Memory fallbacks when semantic search is off or DB is missing.
 *
 * Test 1 – semantic off: MEMORY_SEMANTIC_SEARCH=off → no throw, arrays returned
 * Test 2 – no DB: temp root with no memory.db but with gotchas.json → entry appears
 * Test 3 – spawn section: with semantic off → formatMemoryAsMarkdown returns a string
 */
'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-test-'));
  const memDir = path.join(dir, '.claude', 'context', 'memory');
  fs.mkdirSync(memDir, { recursive: true });
  fs.mkdirSync(path.join(memDir, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(memDir, 'sessions'), { recursive: true });
  return { dir, memDir };
}

function cleanupRoot(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Require the module under test
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const managerPath = path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-manager.cjs');

// ---------------------------------------------------------------------------
// Test 1: MEMORY_SEMANTIC_SEARCH=off — no throw, arrays returned
// ---------------------------------------------------------------------------

describe('loadMemoryForContext – semantic search off', () => {
  let origEnv;

  before(() => {
    origEnv = process.env.MEMORY_SEMANTIC_SEARCH;
    process.env.MEMORY_SEMANTIC_SEARCH = 'off';
  });

  after(() => {
    if (origEnv === undefined) {
      delete process.env.MEMORY_SEMANTIC_SEARCH;
    } else {
      process.env.MEMORY_SEMANTIC_SEARCH = origEnv;
    }
  });

  it('returns gotchas and patterns arrays without throwing', () => {
    // Clear require cache so env var takes effect
    const corePath = require.resolve(path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-manager-core.cjs'));
    delete require.cache[corePath];
    const implPath = require.resolve(path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-manager-core-impl.cjs'));
    delete require.cache[implPath];
    delete require.cache[managerPath];

    let result;
    assert.doesNotThrow(() => {
      const manager = require(managerPath);
      result = manager.loadMemoryForContext(PROJECT_ROOT);
    }, 'loadMemoryForContext must not throw when MEMORY_SEMANTIC_SEARCH=off');

    assert.ok(result, 'result must be defined');
    assert.ok(Array.isArray(result.gotchas), 'result.gotchas must be an array');
    assert.ok(Array.isArray(result.patterns), 'result.patterns must be an array');
  });
});

// ---------------------------------------------------------------------------
// Test 2: No DB — file-based fallback (gotchas.json with one entry)
// ---------------------------------------------------------------------------

describe('loadMemoryForContext – no DB, file-based fallback', () => {
  let tmpRoot;
  let memDir;

  before(() => {
    const dirs = makeTempRoot();
    tmpRoot = dirs.dir;
    memDir = dirs.memDir;

    // Write gotchas.json with one entry
    const entry = { text: 'test-gotcha-fallback', timestamp: new Date().toISOString() };
    fs.writeFileSync(path.join(memDir, 'gotchas.json'), JSON.stringify([entry]), 'utf8');
    // Deliberately do NOT create .claude/context/data/memory.db
  });

  after(() => {
    cleanupRoot(tmpRoot);
  });

  it('returns the gotcha entry from file when DB is absent, without throwing', () => {
    // Clear module cache so a fresh ContextualMemory is created with temp root
    const ctxMemPath = require.resolve(path.resolve(PROJECT_ROOT, '.claude/lib/memory/contextual-memory.cjs'));
    delete require.cache[ctxMemPath];

    let result;
    assert.doesNotThrow(() => {
      const { ContextualMemory } = require(ctxMemPath);
      const cm = new ContextualMemory({ projectRoot: tmpRoot });
      result = cm.loadContextSync({});
    }, 'loadContextSync must not throw when DB is absent');

    assert.ok(result, 'result must be defined');
    assert.ok(Array.isArray(result.gotchas), 'result.gotchas must be an array');
    const found = result.gotchas.some(
      g => g.text === 'test-gotcha-fallback' || JSON.stringify(g).includes('test-gotcha-fallback')
    );
    assert.ok(found, 'gotchas must include the entry from gotchas.json when DB is absent');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Spawn section – formatMemoryAsMarkdown returns a string with semantic off
// ---------------------------------------------------------------------------

describe('formatMemoryAsMarkdown – semantic off returns string', () => {
  let origEnv;

  before(() => {
    origEnv = process.env.MEMORY_SEMANTIC_SEARCH;
    process.env.MEMORY_SEMANTIC_SEARCH = 'off';
  });

  after(() => {
    if (origEnv === undefined) {
      delete process.env.MEMORY_SEMANTIC_SEARCH;
    } else {
      process.env.MEMORY_SEMANTIC_SEARCH = origEnv;
    }
  });

  it('returns a non-empty string and does not throw', () => {
    const corePath = require.resolve(path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-manager-core.cjs'));
    delete require.cache[corePath];
    const implPath = require.resolve(path.resolve(PROJECT_ROOT, '.claude/lib/memory/memory-manager-core-impl.cjs'));
    delete require.cache[implPath];
    delete require.cache[managerPath];

    let section;
    assert.doesNotThrow(() => {
      const manager = require(managerPath);
      section = manager.formatMemoryAsMarkdown(PROJECT_ROOT);
    }, 'formatMemoryAsMarkdown must not throw when MEMORY_SEMANTIC_SEARCH=off');

    assert.ok(typeof section === 'string', 'formatMemoryAsMarkdown must return a string');
    assert.ok(section.length > 0, 'formatMemoryAsMarkdown must return a non-empty string');
  });
});
