#!/usr/bin/env node
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { incrementLTMAccessCount } = require('../../../.claude/lib/memory/contextual-memory.cjs');

describe('incrementLTMAccessCount', () => {
  let tmpDir;
  let ltmDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-access-test-'));
    ltmDir = path.join(tmpDir, 'ltm');
    fs.mkdirSync(ltmDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('increments accessCount from 0 to 1 and sets lastAccessed', () => {
    const filePath = path.join(ltmDir, 'summary_001.json');
    const initial = { accessCount: 0, content: 'test entry' };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    const before = Date.now();
    incrementLTMAccessCount(filePath);
    const after = Date.now();

    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(updated.accessCount, 1, 'accessCount should be 1');
    assert.ok(updated.lastAccessed, 'lastAccessed should be set');

    const ts = new Date(updated.lastAccessed).getTime();
    assert.ok(ts >= before && ts <= after, 'lastAccessed should be within the call window');
  });

  test('increments accessCount from existing value (5 -> 6)', () => {
    const filePath = path.join(ltmDir, 'summary_002.json');
    const initial = { accessCount: 5, content: 'another entry' };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    incrementLTMAccessCount(filePath);

    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(updated.accessCount, 6, 'accessCount should be 6');
  });

  test('defaults accessCount to 0 then increments to 1 when field is missing', () => {
    const filePath = path.join(ltmDir, 'summary_003.json');
    const initial = { content: 'no accessCount field' };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    incrementLTMAccessCount(filePath);

    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(updated.accessCount, 1, 'accessCount should default to 0 then become 1');
  });

  test('skips non-ltm paths (path without /ltm/ segment)', () => {
    const mtmDir = path.join(tmpDir, 'mtm');
    fs.mkdirSync(mtmDir, { recursive: true });
    const filePath = path.join(mtmDir, 'session_001.json');
    const initial = { accessCount: 0, content: 'mtm entry' };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    incrementLTMAccessCount(filePath);

    const unchanged = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(unchanged.accessCount, 0, 'non-ltm file should not be modified');
    assert.equal(unchanged.lastAccessed, undefined, 'lastAccessed should not be set');
  });

  test('skips when filePath is undefined', () => {
    // Should not throw
    assert.doesNotThrow(() => incrementLTMAccessCount(undefined));
  });

  test('skips when filePath is null', () => {
    assert.doesNotThrow(() => incrementLTMAccessCount(null));
  });

  test('skips when filePath is an empty string', () => {
    assert.doesNotThrow(() => incrementLTMAccessCount(''));
  });

  test('does not throw when file does not exist', () => {
    const missingPath = path.join(ltmDir, 'does_not_exist.json');
    assert.doesNotThrow(() => incrementLTMAccessCount(missingPath));
  });

  test('handles Windows-style backslash paths for /ltm/ detection', () => {
    // Simulate a Windows path that contains \ltm\ — should still be detected
    const filePath = path.join(ltmDir, 'summary_win.json');
    const initial = { accessCount: 0 };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    // Use the actual path (which on Windows uses backslashes) — should still work
    incrementLTMAccessCount(filePath);

    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(updated.accessCount, 1, 'should handle native path separators');
  });

  test('preserves existing fields in the JSON file', () => {
    const filePath = path.join(ltmDir, 'summary_004.json');
    const initial = {
      accessCount: 2,
      content: 'important data',
      consolidated_at: '2026-01-01T00:00:00.000Z',
      tags: ['decision', 'architecture'],
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');

    incrementLTMAccessCount(filePath);

    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(updated.accessCount, 3, 'accessCount should increment');
    assert.equal(updated.content, 'important data', 'content should be preserved');
    assert.equal(
      updated.consolidated_at,
      '2026-01-01T00:00:00.000Z',
      'consolidated_at should be preserved'
    );
    assert.deepEqual(updated.tags, ['decision', 'architecture'], 'tags should be preserved');
  });
});
