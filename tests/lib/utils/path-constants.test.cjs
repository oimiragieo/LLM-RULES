'use strict';
// Red phase — all tests fail until .claude/lib/utils/path-constants.cjs is created
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// This require FAILS until Green phase creates the module
const {
  PROJECT_ROOT,
  HOOKS_DIR,
  SKILLS_DIR,
  AGENTS_DIR,
  CONFIG_DIR,
  CONTEXT_DIR,
  SCHEMAS_DIR,
  SKILL_INDEX_PATH,
  CATALOG_PATH,
  AGENT_REGISTRY_PATH,
  ACTIVE_CREATORS_PATH,
  INTEGRATION_QUEUE_PATH,
  resolveProjectPath,
} = require('../../../.claude/lib/utils/path-constants.cjs');

describe('Path Constants — structural invariants', () => {
  test('PROJECT_ROOT contains agent-studio', () => {
    assert.ok(PROJECT_ROOT.includes('agent-studio'), `Got: ${PROJECT_ROOT}`);
  });

  test('PROJECT_ROOT is absolute', () => {
    assert.ok(path.isAbsolute(PROJECT_ROOT));
  });

  test('all constants use forward slashes (Windows compatible)', () => {
    const constants = [
      PROJECT_ROOT, HOOKS_DIR, SKILLS_DIR, AGENTS_DIR,
      CONFIG_DIR, CONTEXT_DIR, SCHEMAS_DIR,
      SKILL_INDEX_PATH, CATALOG_PATH, AGENT_REGISTRY_PATH,
      ACTIVE_CREATORS_PATH, INTEGRATION_QUEUE_PATH,
    ];
    for (const p of constants) {
      assert.strictEqual(p.includes('\\'), false, `Path has backslashes: ${p}`);
    }
  });

  test('SKILL_INDEX_PATH ends with skill-index.json', () => {
    assert.ok(SKILL_INDEX_PATH.endsWith('skill-index.json'));
  });

  test('SKILL_INDEX_PATH is under .claude/config', () => {
    assert.ok(SKILL_INDEX_PATH.includes('.claude/config'));
  });

  test('CATALOG_PATH ends with skill-catalog.md', () => {
    assert.ok(CATALOG_PATH.endsWith('skill-catalog.md'));
  });

  test('CATALOG_PATH is under .claude/context/artifacts/catalogs', () => {
    assert.ok(CATALOG_PATH.includes('artifacts/catalogs'));
  });

  test('AGENT_REGISTRY_PATH ends with agent-registry.json', () => {
    assert.ok(AGENT_REGISTRY_PATH.endsWith('agent-registry.json'));
  });

  test('INTEGRATION_QUEUE_PATH ends with integration-queue.jsonl', () => {
    assert.ok(INTEGRATION_QUEUE_PATH.endsWith('integration-queue.jsonl'));
  });

  // Confirm INTEGRATION_QUEUE_PATH matches the path post-creation-integration.cjs
  // uses when writing queue entries — these MUST be the same file.
  test('INTEGRATION_QUEUE_PATH is under .claude/context/runtime', () => {
    assert.ok(INTEGRATION_QUEUE_PATH.includes('.claude/context/runtime'));
  });
});

describe('resolveProjectPath — safety invariants', () => {
  test('resolves relative path under project root', () => {
    const result = resolveProjectPath('.claude/hooks');
    assert.ok(result.startsWith(PROJECT_ROOT));
    assert.ok(result.includes('.claude/hooks'));
    assert.strictEqual(result.includes('\\'), false);
  });

  test('throws on path traversal', () => {
    assert.throws(() => resolveProjectPath('../../etc/passwd'), /traversal/i);
  });

  test('throws on empty string', () => {
    assert.throws(() => resolveProjectPath(''), /required/i);
  });

  test('throws on null', () => {
    assert.throws(() => resolveProjectPath(null), /required/i);
  });

  test('is idempotent — same input produces same output', () => {
    const a = resolveProjectPath('.claude/skills');
    const b = resolveProjectPath('.claude/skills');
    assert.strictEqual(a, b);
  });
});
