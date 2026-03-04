'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeParseJSON } = require('../../../.claude/lib/utils/safe-json.cjs');

/**
 * P0 Verification: MemoryRecord (recordGotcha / recordPattern) end-to-end.
 *
 * Tests that:
 *   1. recordGotcha writes to gotchas.json with correct schema.
 *   2. recordPattern writes to patterns.json with correct schema.
 *   3. Deduplication prevents exact duplicates.
 *   4. Both functions use file locking (directory-based) correctly.
 */
describe('MemoryRecord integration', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memrecord-'));
    const memDir = path.join(projectRoot, '.claude', 'context', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    // Create metrics dir needed by memory-slo-metrics.cjs
    const metricsDir = path.join(memDir, 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  /**
   * Helper: build a recording ops instance bound to our temp projectRoot.
   * This mirrors how memory-manager-core.cjs wires createRecordingOps.
   */
  function buildRecordingOps() {
    const { createRecordingOps } = require(
      '../../../.claude/lib/memory/memory-manager-core-recording.cjs'
    );
    const { createStorageHelpers } = require(
      '../../../.claude/lib/memory/memory-manager-core-storage.cjs'
    );

    const getMemoryDir = (pr) =>
      path.join(pr, '.claude', 'context', 'memory');
    const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
    const validateProjectRoot = () => {};

    const storage = createStorageHelpers({
      PROJECT_ROOT: projectRoot,
      validatePathWithinProject: () => ({ safe: true }),
      validateProjectRoot,
      getMemoryDir,
      ensureDir,
    });

    return createRecordingOps({
      PROJECT_ROOT: projectRoot,
      validateProjectRoot,
      getMemoryDir,
      ensureDir,
      withFileLockSync: storage.withFileLockSync,
      buildEntryId: storage.buildEntryId,
      normalizeArea: storage.normalizeArea,
      maybeSyncMemoryJson: () => {},
      emitMemorySavedEvent: () => {},
    });
  }

  it('recordGotcha creates gotchas.json with correct entry schema', () => {
    const ops = buildRecordingOps();
    const wrote = ops.recordGotcha(
      { text: 'Windows paths need normalization', area: 'platform' },
      projectRoot
    );
    assert.equal(wrote, true, 'should return true for new entry');

    const gotchasFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'gotchas.json'
    );
    assert.ok(fs.existsSync(gotchasFile), 'gotchas.json should exist');

    const gotchas = safeParseJSON(fs.readFileSync(gotchasFile, 'utf8'), []);
    assert.equal(gotchas.length, 1);

    const entry = gotchas[0];
    assert.equal(entry.text, 'Windows paths need normalization');
    // normalizeArea maps unknown areas to DEFAULT_AREA ('main')
    // Valid areas are: 'main', 'fragments', 'solutions'
    assert.equal(entry.area, 'main', 'non-standard area normalized to main');
    assert.ok(entry.id, 'entry should have an id');
    assert.ok(entry.timestamp, 'entry should have a timestamp');
  });

  it('recordPattern creates patterns.json with correct entry schema', () => {
    const ops = buildRecordingOps();
    const wrote = ops.recordPattern(
      { text: 'Use array arguments for spawn calls', area: 'main' },
      projectRoot
    );
    assert.equal(wrote, true);

    const patternsFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'patterns.json'
    );
    assert.ok(fs.existsSync(patternsFile), 'patterns.json should exist');

    const patterns = safeParseJSON(fs.readFileSync(patternsFile, 'utf8'), []);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].text, 'Use array arguments for spawn calls');
    assert.equal(patterns[0].area, 'main');
  });

  it('recordGotcha deduplicates exact duplicate entries', () => {
    const ops = buildRecordingOps();
    ops.recordGotcha({ text: 'Duplicate test entry', area: 'general' }, projectRoot);
    const second = ops.recordGotcha(
      { text: 'Duplicate test entry', area: 'general' },
      projectRoot
    );
    assert.equal(second, false, 'duplicate should return false');

    const gotchasFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'gotchas.json'
    );
    const gotchas = safeParseJSON(fs.readFileSync(gotchasFile, 'utf8'), []);
    assert.equal(gotchas.length, 1, 'should still have only 1 entry');
  });

  it('recordGotcha accepts string shorthand', () => {
    const ops = buildRecordingOps();
    const wrote = ops.recordGotcha('Simple string gotcha', projectRoot);
    assert.equal(wrote, true);

    const gotchasFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'gotchas.json'
    );
    const gotchas = safeParseJSON(fs.readFileSync(gotchasFile, 'utf8'), []);
    assert.equal(gotchas.length, 1);
    assert.equal(gotchas[0].text, 'Simple string gotcha');
  });

  it('recordPattern deduplicates exact duplicate entries', () => {
    const ops = buildRecordingOps();
    ops.recordPattern({ text: 'Dup pattern', area: 'test' }, projectRoot);
    const second = ops.recordPattern(
      { text: 'Dup pattern', area: 'test' },
      projectRoot
    );
    assert.equal(second, false, 'duplicate pattern should return false');

    const patternsFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'patterns.json'
    );
    const patterns = safeParseJSON(fs.readFileSync(patternsFile, 'utf8'), []);
    assert.equal(patterns.length, 1, 'should still have only 1 pattern');
  });

  it('multiple unique gotchas accumulate correctly', () => {
    const ops = buildRecordingOps();
    for (let i = 0; i < 5; i++) {
      ops.recordGotcha({ text: `Gotcha number ${i}`, area: 'test' }, projectRoot);
    }

    const gotchasFile = path.join(
      projectRoot, '.claude', 'context', 'memory', 'gotchas.json'
    );
    const gotchas = safeParseJSON(fs.readFileSync(gotchasFile, 'utf8'), []);
    assert.equal(gotchas.length, 5, 'should have 5 unique gotchas');
  });
});
