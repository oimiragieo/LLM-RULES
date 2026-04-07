'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { slugifyValId, checkEvidenceExists, collectFeatureEvidence } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'mission', 'evidence-collector.cjs')
);

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('slugifyValId', () => {
  it('lowercases VAL IDs', () => {
    assert.equal(slugifyValId('VAL-MEM-001'), 'val-mem-001');
  });

  it('handles complex IDs', () => {
    assert.equal(slugifyValId('VAL-RALPH-023'), 'val-ralph-023');
  });
});

describe('checkEvidenceExists', () => {
  it('returns hasEvidence=true when all evidence files exist', () => {
    const evidenceDir = path.join(tmpDir, 'evidence');
    const msDir = path.join(evidenceDir, 'memory-v2');
    fs.mkdirSync(msDir, { recursive: true });
    fs.writeFileSync(path.join(msDir, 'val-mem-001-fts5-search.txt'), 'evidence', 'utf8');

    const result = checkEvidenceExists(
      { id: 'fts5-search', milestone: 'memory-v2', fulfills: ['VAL-MEM-001'] },
      evidenceDir
    );
    assert.equal(result.hasEvidence, true);
    assert.deepEqual(result.missing, []);
  });

  it('returns missing when evidence files absent', () => {
    const evidenceDir = path.join(tmpDir, 'evidence');
    const result = checkEvidenceExists(
      { id: 'fts5-search', milestone: 'memory-v2', fulfills: ['VAL-MEM-001', 'VAL-MEM-002'] },
      evidenceDir
    );
    assert.equal(result.hasEvidence, false);
    assert.deepEqual(result.missing, ['VAL-MEM-001', 'VAL-MEM-002']);
  });

  it('returns hasEvidence=true for features with no fulfills', () => {
    const evidenceDir = path.join(tmpDir, 'evidence');
    const result = checkEvidenceExists({ id: 'infra-feature', milestone: 'setup' }, evidenceDir);
    assert.equal(result.hasEvidence, true);
    assert.deepEqual(result.missing, []);
  });
});

describe('collectFeatureEvidence', () => {
  it('runs verification steps and writes evidence files', () => {
    const evidenceDir = path.join(tmpDir, 'evidence');

    const feature = {
      id: 'test-feature',
      milestone: 'test-milestone',
      verificationSteps: ['echo hello'],
      fulfills: ['VAL-TST-001'],
    };

    const result = collectFeatureEvidence({
      feature,
      evidenceDir,
      workingDirectory: tmpDir,
    });

    assert.ok(result.results.length > 0);
    assert.ok(result.evidenceFiles.length > 0);

    // Evidence file should exist
    const evidencePath = result.evidenceFiles[0];
    assert.ok(fs.existsSync(evidencePath));

    const content = fs.readFileSync(evidencePath, 'utf8');
    assert.ok(content.includes('VAL-TST-001'));
    assert.ok(content.includes('test-feature'));
  });

  it('handles empty verificationSteps', () => {
    const evidenceDir = path.join(tmpDir, 'evidence');

    const feature = {
      id: 'empty-feature',
      milestone: 'test',
      verificationSteps: [],
      fulfills: ['VAL-TST-002'],
    };

    const result = collectFeatureEvidence({
      feature,
      evidenceDir,
      workingDirectory: tmpDir,
    });

    assert.equal(result.results.length, 0);
    // Evidence file still created (empty evidence)
    assert.equal(result.evidenceFiles.length, 1);
  });
});
