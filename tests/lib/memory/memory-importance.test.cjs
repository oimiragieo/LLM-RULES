'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  scoreImportance,
  fallbackExtractMemories,
  extractCandidatesFromText,
} = require('../../../.claude/lib/memory/memory-extractor.cjs');

describe('scoreImportance', () => {
  // Long texts (>= 50 chars) get full score; short texts get score - 0.1

  it('returns 0.9 for long CRITICAL text', () => {
    // length >= 50: full 0.9
    assert.equal(
      scoreImportance('CRITICAL: never delete untracked files without asking the user first'),
      0.9
    );
  });

  it('returns 0.8 for short CRITICAL text (< 50 chars)', () => {
    // "CRITICAL: never do this" = 23 chars → 0.9 - 0.1 = 0.8
    assert.equal(scoreImportance('CRITICAL: never do this'), 0.8);
  });

  it('returns 0.9 for long P0 text', () => {
    assert.equal(
      scoreImportance('P0 issue in router that blocks all agent spawning permanently'),
      0.9
    );
  });

  it('returns 0.9 for long IRON LAW text', () => {
    assert.equal(
      scoreImportance('IRON LAW: always call TaskUpdate before and after every task execution'),
      0.9
    );
  });

  it('returns 0.9 for long NEVER text', () => {
    assert.equal(
      scoreImportance('NEVER delete untracked files without explicit user confirmation please'),
      0.9
    );
  });

  it('returns 0.75 for long P1 text', () => {
    assert.equal(
      scoreImportance('P1 priority fix needed for all memory extraction pipelines'),
      0.75
    );
  });

  it('returns 0.65 for short P1 text (< 50 chars)', () => {
    // "P1 priority fix needed" = 22 chars → 0.75 - 0.1 = 0.65
    assert.equal(scoreImportance('P1 priority fix needed'), 0.65);
  });

  it('returns 0.75 for long BLOCKING text', () => {
    assert.equal(
      scoreImportance('BLOCKING: requires full cleanup of all dead references first'),
      0.75
    );
  });

  it('returns 0.75 for long MANDATORY text', () => {
    assert.equal(
      scoreImportance('MANDATORY: run lint and format before every commit to main'),
      0.75
    );
  });

  it('returns 0.7 for long note: text', () => {
    assert.equal(
      scoreImportance('note: check the path normalization carefully on all Windows builds'),
      0.7
    );
  });

  it('returns 0.7 for long pattern: text', () => {
    assert.equal(
      scoreImportance('pattern: use safeParseJSON for all untrusted external inputs always'),
      0.7
    );
  });

  it('returns 0.7 for long gotcha: text', () => {
    assert.equal(
      scoreImportance('gotcha: Windows backslash path issues affect all glob patterns'),
      0.7
    );
  });

  it('returns 0.4 for long resolved text', () => {
    assert.equal(
      scoreImportance('This bug was resolved yesterday after the hotfix was deployed'),
      0.4
    );
  });

  it('returns 0.4 for long fixed text', () => {
    assert.equal(
      scoreImportance('The issue was fixed in commit abc1234 and deployed to prod'),
      0.4
    );
  });

  it('returns 0.4 for long completed text', () => {
    assert.equal(scoreImportance('Task completed successfully after all test suites passed'), 0.4);
  });

  it('returns default 0.5 for neutral long text', () => {
    assert.equal(scoreImportance('The weather is nice today and we should enjoy it outside'), 0.5);
  });

  it('penalizes short text (< 50 chars) with note: prefix', () => {
    // "note: hi" → 0.7 - 0.1 = 0.6
    assert.equal(scoreImportance('note: hi'), 0.6);
  });

  it('penalizes short neutral text', () => {
    // Short neutral: 0.5 - 0.1 = 0.4
    assert.equal(scoreImportance('short text'), 0.4);
  });

  it('clamps max at 0.95', () => {
    const score = scoreImportance(
      'CRITICAL P0 IRON LAW NEVER BLOCKING MANDATORY long enough text here'
    );
    assert.ok(score <= 0.95, `Expected <= 0.95, got ${score}`);
  });

  it('clamps min at 0.1', () => {
    const score = scoreImportance('ok');
    assert.ok(score >= 0.1, `Expected >= 0.1, got ${score}`);
  });

  it('handles empty string', () => {
    const score = scoreImportance('');
    assert.ok(score >= 0.1 && score <= 0.95);
  });
});

describe('fallbackExtractMemories importance field', () => {
  it('attaches importance to pattern records', () => {
    const sessionData = {
      // 43 chars < 50 → CRITICAL score 0.9 - 0.1 = 0.8
      patterns_found: ['CRITICAL: always normalize paths on Windows'],
    };
    const records = fallbackExtractMemories(sessionData);
    assert.equal(records.length, 1);
    assert.ok(typeof records[0].importance === 'number', 'importance should be a number');
    assert.ok(
      records[0].importance >= 0.1 && records[0].importance <= 0.95,
      `importance out of range: ${records[0].importance}`
    );
    // CRITICAL text but < 50 chars → 0.9 - 0.1 = 0.8
    assert.equal(records[0].importance, 0.8);
  });

  it('attaches importance to gotcha records', () => {
    const sessionData = {
      // 48 chars < 50 → resolved score 0.4 - 0.1 = 0.3
      gotchas_encountered: ['resolved: workaround no longer needed, now fixed'],
    };
    const records = fallbackExtractMemories(sessionData);
    assert.equal(records.length, 1);
    assert.ok(typeof records[0].importance === 'number');
    // "resolved" text and < 50 chars → 0.4 - 0.1 = 0.3
    assert.ok(
      Math.abs(records[0].importance - 0.3) < 0.001,
      `Expected ~0.3, got ${records[0].importance}`
    );
  });

  it('attaches importance to decision records', () => {
    const sessionData = {
      decisions_made: ['Use safeParseJSON for all untrusted inputs'],
    };
    const records = fallbackExtractMemories(sessionData);
    assert.equal(records.length, 1);
    assert.ok(typeof records[0].importance === 'number');
    assert.ok(records[0].importance >= 0.1 && records[0].importance <= 0.95);
  });
});

describe('extractCandidatesFromText importance field', () => {
  it('attaches importance to candidates from text lines', () => {
    const text = [
      'pattern: use shell: false for all child processes on Windows and Unix',
      'gotcha: path.relative returns backslash on Windows platforms always',
    ].join('\n');

    const candidates = extractCandidatesFromText(text);
    assert.ok(candidates.length >= 2);
    for (const c of candidates) {
      assert.ok(
        typeof c.importance === 'number',
        `Expected importance number, got: ${c.importance}`
      );
      assert.ok(c.importance >= 0.1 && c.importance <= 0.95);
    }
  });
});

describe('memory-tiers default fields', () => {
  const os = require('os');
  const fs = require('fs');
  const tmpDir = path.join(os.tmpdir(), `.test-memory-importance-${Date.now()}`);

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  it('STM entry includes importance and consolidated defaults', () => {
    const { writeSTMEntry, readSTMEntry } = require('../../../.claude/lib/memory/memory-tiers.cjs');
    const result = writeSTMEntry({ session_id: 'test-1', summary: 'hello' }, tmpDir);
    assert.ok(result.success, 'writeSTMEntry should succeed');
    const entry = readSTMEntry(tmpDir);
    assert.ok(entry !== null, 'Should read back STM entry');
    assert.ok('importance' in entry, 'importance field should be present');
    assert.ok('consolidated' in entry, 'consolidated field should be present');
    assert.equal(entry.importance, 0.5);
    assert.equal(entry.consolidated, false);
  });

  it('caller-supplied importance overrides default', () => {
    const { writeSTMEntry, readSTMEntry } = require('../../../.claude/lib/memory/memory-tiers.cjs');
    writeSTMEntry(
      { session_id: 'test-2', summary: 'hi', importance: 0.9, consolidated: true },
      tmpDir
    );
    const entry = readSTMEntry(tmpDir);
    assert.equal(entry.importance, 0.9, 'caller importance should win over default');
    assert.equal(entry.consolidated, true, 'caller consolidated should win over default');
  });
});

describe('contextual-memory _applyRecencyWeight with importance', () => {
  it('uses importance from result when available', () => {
    const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory({ projectRoot: process.cwd() });

    const now = new Date().toISOString();
    const results = [
      {
        content: 'high importance record',
        metadata: { timestamp: now },
        rrf_score: 0.5,
        importance: 0.9,
      },
      {
        content: 'low importance record',
        metadata: { timestamp: now },
        rrf_score: 0.5,
        importance: 0.1,
      },
    ];

    const weighted = cm._applyRecencyWeight(results);
    // Both have same rrf_score and recency; high importance should rank first
    assert.equal(weighted[0].content, 'high importance record');
    assert.ok(
      weighted[0].rrf_score > weighted[1].rrf_score,
      `High importance (${weighted[0].rrf_score}) should beat low importance (${weighted[1].rrf_score})`
    );
  });

  it('uses importance from metadata when result.importance missing', () => {
    const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory({ projectRoot: process.cwd() });

    const now = new Date().toISOString();
    const results = [
      {
        content: 'meta importance record',
        metadata: { timestamp: now, importance: 0.85 },
        rrf_score: 0.4,
      },
      {
        content: 'no importance record',
        metadata: { timestamp: now },
        rrf_score: 0.4,
      },
    ];

    const weighted = cm._applyRecencyWeight(results);
    assert.equal(weighted[0].content, 'meta importance record');
    assert.ok(typeof weighted[0]._importance_score === 'number', '_importance_score should be set');
    assert.equal(weighted[0]._importance_score, 0.85);
  });

  it('defaults importance to 0.5 when not present', () => {
    const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory({ projectRoot: process.cwd() });

    const now = new Date().toISOString();
    const results = [
      {
        content: 'no importance field',
        metadata: { timestamp: now },
        rrf_score: 0.6,
      },
    ];

    const weighted = cm._applyRecencyWeight(results);
    assert.equal(weighted[0]._importance_score, 0.5);
  });

  it('returns empty array unchanged', () => {
    const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory({ projectRoot: process.cwd() });
    assert.deepEqual(cm._applyRecencyWeight([]), []);
  });

  it('attaches _recency_weight to results', () => {
    const { ContextualMemory } = require('../../../.claude/lib/memory/contextual-memory.cjs');
    const cm = new ContextualMemory({ projectRoot: process.cwd() });

    const now = new Date().toISOString();
    const results = [{ content: 'test', metadata: { timestamp: now }, rrf_score: 0.5 }];
    const weighted = cm._applyRecencyWeight(results);
    assert.ok(typeof weighted[0]._recency_weight === 'number', '_recency_weight should be set');
  });
});
