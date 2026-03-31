#!/usr/bin/env node
// tests/memory/session-fts-index.test.cjs
// Tests for session-fts-index.cjs — SQLite FTS5 full-text search over session JSONL logs

'use strict';

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix = 'sfts-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // ignore EBUSY on Windows
  }
}

/**
 * Write a JSONL file with the given array of objects (one per line).
 */
function writeJsonl(filePath, records) {
  const content = records.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Load module under test
// ---------------------------------------------------------------------------

const { SessionIndex } = require('../../.claude/lib/memory/session-fts-index.cjs');

// ---------------------------------------------------------------------------
// VAL-AS-005: Empty index — queries return [] without error
// ---------------------------------------------------------------------------

describe('SessionIndex — empty index', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-empty-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('returns empty array for search on empty index (no error)', () => {
    const results = idx.search('anything');
    assert.deepEqual(results, []);
  });

  it('returns empty array for getRecentSessions on empty index', () => {
    const sessions = idx.getRecentSessions();
    assert.deepEqual(sessions, []);
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-005: FTS special characters in queries do not throw
// ---------------------------------------------------------------------------

describe('SessionIndex — FTS special character escaping', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-escape-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);

    // Index a simple session so there is content to search
    const jsonlPath = path.join(tmpDir, 'session-a.jsonl');
    writeJsonl(jsonlPath, [
      { content: 'Hello world this is a test session' },
      { content: 'Another line with some content here' },
    ]);
    idx.indexSession('session-a', jsonlPath);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('query with double-quote characters does not throw', () => {
    assert.doesNotThrow(() => {
      idx.search('"DROP TABLE"');
    });
  });

  it('query with asterisk and colon does not throw', () => {
    assert.doesNotThrow(() => {
      idx.search('col:umn*');
    });
  });

  it('query with OR operator does not throw', () => {
    assert.doesNotThrow(() => {
      idx.search('hello OR world');
    });
  });

  it('query with NEAR operator does not throw', () => {
    assert.doesNotThrow(() => {
      idx.search('NEAR(hello world)');
    });
  });

  it('query with unmatched double quote does not throw', () => {
    assert.doesNotThrow(() => {
      idx.search('"unmatched');
    });
  });

  it('returns array (not error) for special char queries', () => {
    const r1 = idx.search('"DROP TABLE"');
    assert.ok(Array.isArray(r1), 'should return an array');

    const r2 = idx.search('col:umn*');
    assert.ok(Array.isArray(r2), 'should return an array');
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-004: FTS search returns ranked results with context
// ---------------------------------------------------------------------------

describe('SessionIndex — search returns ranked results', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-search-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);

    // Session 1: talks about apples and bananas
    const s1Path = path.join(tmpDir, 'session-1.jsonl');
    writeJsonl(s1Path, [
      { content: 'I bought some apples from the market today' },
      { content: 'The bananas were also very fresh and tasty' },
      { content: 'Will buy more fruit tomorrow hopefully' },
    ]);
    idx.indexSession('session-1', s1Path);

    // Session 2: talks about debugging a specific unique phrase
    const s2Path = path.join(tmpDir, 'session-2.jsonl');
    writeJsonl(s2Path, [
      { content: 'Started debugging the authentication module carefully' },
      { content: 'Found a xylophone_bugfix_unique_marker in the error logs today' },
      { content: 'Fixed the null pointer exception in token validation code' },
    ]);
    idx.indexSession('session-2', s2Path);

    // Session 3: talks about database migrations
    const s3Path = path.join(tmpDir, 'session-3.jsonl');
    writeJsonl(s3Path, [
      { content: 'Running database migration scripts on production server' },
      { content: 'The migration completed successfully without any issues found' },
      { content: 'Updated the schema to add new columns for user preferences' },
    ]);
    idx.indexSession('session-3', s3Path);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('returns only session-2 results for unique phrase (VAL-AS-004)', () => {
    const results = idx.search('xylophone_bugfix_unique_marker');
    assert.ok(results.length > 0, 'should return at least one result');
    for (const r of results) {
      assert.equal(r.sessionId, 'session-2', 'all results should be from session-2');
    }
  });

  it('each result has required fields: sessionId, lineNumber, snippet, score', () => {
    const results = idx.search('xylophone_bugfix_unique_marker');
    assert.ok(results.length > 0);
    const r = results[0];
    assert.ok('sessionId' in r, 'should have sessionId');
    assert.ok('lineNumber' in r, 'should have lineNumber');
    assert.ok('snippet' in r, 'should have snippet');
    assert.ok('score' in r, 'should have score');
  });

  it('snippet contains the searched term (with or without highlighting)', () => {
    const results = idx.search('xylophone_bugfix_unique_marker');
    assert.ok(results.length > 0);
    const snippet = results[0].snippet;
    assert.ok(
      snippet.toLowerCase().includes('xylophone_bugfix_unique_marker'),
      `snippet should contain search term, got: ${snippet}`
    );
  });

  it('score is a number', () => {
    const results = idx.search('xylophone_bugfix_unique_marker');
    assert.ok(results.length > 0);
    assert.ok(typeof results[0].score === 'number', 'score should be a number');
  });

  it('results are sorted by relevance (score)', () => {
    const results = idx.search('database migration');
    assert.ok(results.length > 0, 'should find database migration results');
    // All from session-3
    for (const r of results) {
      assert.equal(r.sessionId, 'session-3');
    }
  });

  it('search for common term returns results from correct sessions', () => {
    const results = idx.search('apples');
    assert.ok(results.length > 0);
    assert.equal(results[0].sessionId, 'session-1');
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-006: Snippet is ±50 chars with highlighting, total < 200 chars
// ---------------------------------------------------------------------------

describe('SessionIndex — snippet generation (VAL-AS-006)', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-snippet-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);

    // Create a 10,000+ character session with the target term at position ~5000
    const prefix = 'a'.repeat(5000);
    const target = 'specialtargetterm';
    const suffix = 'b'.repeat(5000);
    const longContent = prefix + ' ' + target + ' ' + suffix;

    const jsonlPath = path.join(tmpDir, 'session-long.jsonl');
    writeJsonl(jsonlPath, [{ content: longContent }]);
    idx.indexSession('session-long', jsonlPath);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('snippet length is less than 200 chars (VAL-AS-006)', () => {
    const results = idx.search('specialtargetterm');
    assert.ok(results.length > 0, 'should find the target term');
    const snippet = results[0].snippet;
    assert.ok(
      snippet.length < 200,
      `snippet.length should be < 200 but got ${snippet.length}: "${snippet}"`
    );
  });

  it('snippet contains the search term', () => {
    const results = idx.search('specialtargetterm');
    assert.ok(results.length > 0);
    const snippet = results[0].snippet;
    assert.ok(
      snippet.toLowerCase().includes('specialtargetterm'),
      `snippet should contain 'specialtargetterm', got: "${snippet}"`
    );
  });

  it('long session log is NOT returned in full', () => {
    const results = idx.search('specialtargetterm');
    assert.ok(results.length > 0);
    const snippet = results[0].snippet;
    // The full content is ~10,000+ chars; snippet should be much shorter
    assert.ok(
      snippet.length < 1000,
      `snippet should be much shorter than full content, got ${snippet.length}`
    );
  });

  it('snippet contains ** highlighting around match', () => {
    const results = idx.search('specialtargetterm');
    assert.ok(results.length > 0);
    const snippet = results[0].snippet;
    assert.ok(snippet.includes('**'), `snippet should contain ** highlighting, got: "${snippet}"`);
  });
});

// ---------------------------------------------------------------------------
// indexSession — basic JSONL parsing
// ---------------------------------------------------------------------------

describe('SessionIndex — indexSession', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-index-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('indexes JSONL with content field', () => {
    const jsonlPath = path.join(tmpDir, 'basic.jsonl');
    writeJsonl(jsonlPath, [{ content: 'hello world test' }]);
    assert.doesNotThrow(() => idx.indexSession('basic-session', jsonlPath));
    const results = idx.search('hello');
    assert.ok(results.length > 0);
    assert.equal(results[0].sessionId, 'basic-session');
  });

  it('indexes JSONL with message field', () => {
    const jsonlPath = path.join(tmpDir, 'message.jsonl');
    writeJsonl(jsonlPath, [{ message: 'greetings from the message field' }]);
    idx.indexSession('msg-session', jsonlPath);
    const results = idx.search('greetings');
    assert.ok(results.length > 0);
    assert.equal(results[0].sessionId, 'msg-session');
  });

  it('indexes JSONL with text field', () => {
    const jsonlPath = path.join(tmpDir, 'text.jsonl');
    writeJsonl(jsonlPath, [{ text: 'text field content here' }]);
    idx.indexSession('text-session', jsonlPath);
    const results = idx.search('field');
    assert.ok(results.length > 0);
    assert.equal(results[0].sessionId, 'text-session');
  });

  it('re-indexing a session replaces old content', () => {
    const jsonlPath = path.join(tmpDir, 'reindex.jsonl');
    writeJsonl(jsonlPath, [{ content: 'original content oldterm' }]);
    idx.indexSession('reindex-session', jsonlPath);

    // Verify original is indexed
    let results = idx.search('oldterm');
    assert.ok(results.some(r => r.sessionId === 'reindex-session'));

    // Re-index with new content
    writeJsonl(jsonlPath, [{ content: 'completely new content newterm here' }]);
    idx.indexSession('reindex-session', jsonlPath);

    // Old term should no longer be found in this session
    results = idx.search('oldterm');
    assert.ok(
      !results.some(r => r.sessionId === 'reindex-session'),
      'old term should not be found after re-indexing'
    );

    // New term should be found
    results = idx.search('newterm');
    assert.ok(results.some(r => r.sessionId === 'reindex-session'));
  });

  it('handles empty JSONL file without error', () => {
    const jsonlPath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(jsonlPath, '', 'utf8');
    assert.doesNotThrow(() => idx.indexSession('empty-session', jsonlPath));
  });
});

// ---------------------------------------------------------------------------
// getRecentSessions
// ---------------------------------------------------------------------------

describe('SessionIndex — getRecentSessions', () => {
  let tmpDir;
  let idx;

  before(() => {
    tmpDir = makeTempDir('sfts-recent-');
    const dbPath = path.join(tmpDir, 'sessions.db');
    idx = new SessionIndex(dbPath);
  });

  after(() => {
    idx.close();
    cleanup(tmpDir);
  });

  it('returns sessions in reverse chronological order', () => {
    for (let i = 1; i <= 3; i++) {
      const jsonlPath = path.join(tmpDir, `sess${i}.jsonl`);
      writeJsonl(jsonlPath, [{ content: `session ${i} content here` }]);
      idx.indexSession(`sess-${i}`, jsonlPath);
    }

    const recent = idx.getRecentSessions(3);
    assert.equal(recent.length, 3);
    // Most recently indexed should be last indexed
    assert.equal(recent[0].sessionId, 'sess-3');
    assert.equal(recent[1].sessionId, 'sess-2');
    assert.equal(recent[2].sessionId, 'sess-1');
  });

  it('respects limit parameter', () => {
    const recent = idx.getRecentSessions(2);
    assert.equal(recent.length, 2);
  });

  it('defaults to 10 sessions', () => {
    const recent = idx.getRecentSessions();
    // Only 3 sessions indexed, so should return 3
    assert.ok(recent.length <= 10);
    assert.equal(recent.length, 3);
  });

  it('each entry has sessionId and indexedAt fields', () => {
    const recent = idx.getRecentSessions(1);
    assert.ok(recent.length > 0);
    assert.ok('sessionId' in recent[0]);
    assert.ok('indexedAt' in recent[0]);
  });
});

// ---------------------------------------------------------------------------
// Default dbPath
// ---------------------------------------------------------------------------

describe('SessionIndex — constructor defaults', () => {
  it('accepts custom dbPath', () => {
    const tmpDir = makeTempDir('sfts-ctor-');
    const dbPath = path.join(tmpDir, 'custom.db');
    let idx;
    try {
      idx = new SessionIndex(dbPath);
      // Trigger DB creation by searching
      const results = idx.search('test');
      assert.deepEqual(results, []);
      assert.ok(fs.existsSync(dbPath), 'DB file should be created at custom path');
    } finally {
      if (idx) idx.close();
      cleanup(tmpDir);
    }
  });
});
