#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeCascadeEntries,
  readExistingEntries,
  hasPendingCascade,
} = require('../../../.claude/lib/creators/cascade-entry-writer.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cascade-writer-'));
}

function scaffoldProjectRoot(root) {
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

function queuePath(root) {
  return path.join(root, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
}

function readQueue(root) {
  const p = queuePath(root);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function writeQueue(root, entries) {
  const p = queuePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''),
    'utf8'
  );
}

function makeCascade(agent, skill, reason) {
  return { agent, skill, reason: reason || `Skill "${skill}" updated` };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cascade Entry Writer', () => {
  let root;

  beforeEach(() => {
    root = makeTmpDir();
    scaffoldProjectRoot(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writeCascadeEntries writes one JSONL entry per affected agent', () => {
    const cascades = [
      makeCascade('accessibility-tester', 'accessibility'),
      makeCascade('frontend-pro', 'accessibility'),
    ];

    const result = writeCascadeEntries(cascades, root);
    assert.equal(result.written, 2);

    const entries = readQueue(root);
    assert.equal(entries.length, 2);
  });

  it('entries use trigger: "skill_cascade"', () => {
    const cascades = [makeCascade('developer', 'tdd')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.equal(entries[0].trigger, 'skill_cascade');
  });

  it('entries include sourceSkill name in evidence field', () => {
    const cascades = [makeCascade('developer', 'tdd', 'Tool changes detected')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.ok(entries[0].evidence.includes('tdd'), 'evidence should mention the skill name');
    assert.ok(
      entries[0].evidence.includes('Tool changes detected'),
      'evidence should include reason'
    );
  });

  it('entries have targetArtifact with type: "agent" and agent name', () => {
    const cascades = [makeCascade('qa', 'tdd')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.deepStrictEqual(entries[0].targetArtifact, { type: 'agent', name: 'qa' });
  });

  it('entries have source: "other" and suggestedArtifactType: "agent"', () => {
    const cascades = [makeCascade('developer', 'debugging')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.equal(entries[0].source, 'other');
    assert.equal(entries[0].suggestedArtifactType, 'agent');
  });

  it('entries have status: "proposed"', () => {
    const cascades = [makeCascade('developer', 'tdd')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.equal(entries[0].status, 'proposed');
  });

  it('does not write duplicates if agent already has pending cascade', () => {
    // Pre-populate queue with an existing pending cascade for developer
    writeQueue(root, [
      {
        id: 'cascade_developer_existing',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'skill_cascade',
        evidence: 'Skill "tdd" updated previously',
        suggestedArtifactType: 'agent',
        summary: 'Cascade: update agent "developer"',
        status: 'proposed',
        targetArtifact: { type: 'agent', name: 'developer' },
      },
    ]);

    const cascades = [makeCascade('developer', 'debugging'), makeCascade('qa', 'debugging')];
    const result = writeCascadeEntries(cascades, root);

    assert.equal(result.written, 1, 'Should write only qa (developer already pending)');
    assert.equal(result.skipped, 1, 'Should skip developer');

    const entries = readQueue(root);
    assert.equal(entries.length, 2, 'Total entries: 1 existing + 1 new');
    assert.equal(entries[1].targetArtifact.name, 'qa');
  });

  it('dryRun returns entries without writing to file', () => {
    const cascades = [makeCascade('developer', 'tdd')];
    const result = writeCascadeEntries(cascades, root, { dryRun: true });

    assert.equal(result.written, 1);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].trigger, 'skill_cascade');

    // File should NOT exist
    assert.equal(
      fs.existsSync(queuePath(root)),
      false,
      'Queue file should not be written in dryRun'
    );
  });

  it('appends to existing JSONL without corrupting prior entries', () => {
    // Write some existing non-cascade entries
    const existingEntries = [
      {
        id: 'req_existing_1',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'stale_skill',
        evidence: 'Skill tdd is stale',
        suggestedArtifactType: 'skill',
        summary: 'Update tdd skill',
        status: 'proposed',
      },
      {
        id: 'req_existing_2',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'user_request',
        evidence: 'User asked for debugging update',
        suggestedArtifactType: 'skill',
        summary: 'Update debugging skill',
        status: 'proposed',
      },
    ];
    writeQueue(root, existingEntries);

    const cascades = [makeCascade('developer', 'tdd')];
    writeCascadeEntries(cascades, root);

    const entries = readQueue(root);
    assert.equal(entries.length, 3, 'Should have 2 existing + 1 new');
    assert.equal(entries[0].id, 'req_existing_1', 'First existing entry intact');
    assert.equal(entries[1].id, 'req_existing_2', 'Second existing entry intact');
    assert.equal(entries[2].trigger, 'skill_cascade', 'New cascade appended');
  });

  it('returns { written: number, skipped: number, entries: object[] }', () => {
    const cascades = [makeCascade('developer', 'tdd'), makeCascade('qa', 'tdd')];
    const result = writeCascadeEntries(cascades, root);

    assert.equal(typeof result.written, 'number');
    assert.equal(typeof result.skipped, 'number');
    assert.ok(Array.isArray(result.entries));
    assert.equal(result.written, 2);
    assert.equal(result.skipped, 0);
    assert.equal(result.entries.length, 2);

    // Verify entry shape
    for (const entry of result.entries) {
      assert.ok(entry.id, 'entry should have id');
      assert.ok(entry.timestamp, 'entry should have timestamp');
      assert.equal(entry.source, 'other');
      assert.equal(entry.trigger, 'skill_cascade');
      assert.ok(entry.evidence);
      assert.equal(entry.suggestedArtifactType, 'agent');
      assert.ok(entry.summary);
      assert.equal(entry.status, 'proposed');
      assert.ok(entry.targetArtifact);
    }
  });
});
