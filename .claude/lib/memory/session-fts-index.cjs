// .claude/lib/memory/session-fts-index.cjs
// SQLite FTS5 full-text search index over session JSONL log files.
//
// Provides:
//   - indexSession(sessionId, jsonlPath)  – index a JSONL file into FTS5
//   - search(query, options?)             – BM25-ranked FTS5 search
//   - getRecentSessions(limit?)           – N most recently indexed sessions

'use strict';

const fs = require('fs');
const path = require('path');

let Database;
try {
  Database = require('better-sqlite3');
} catch (_e) {
  // Fallback: try built-in sqlite module (Node 22.5+)
  Database = require('node:sqlite').DatabaseSync;
}

// Default DB path: .claude/data/sessions.db relative to cwd
const DEFAULT_DB_PATH = path.join(process.cwd(), '.claude', 'data', 'sessions.db');

// ---------------------------------------------------------------------------
// Text extraction from JSONL entries
// ---------------------------------------------------------------------------

/**
 * Extract text content from a raw JSONL line.
 * Handles multiple common formats used in Claude Code session logs and generic JSONL.
 *
 * @param {string} rawLine - A single line from a JSONL file
 * @returns {string} Extracted text, or empty string if nothing useful found
 */
function extractText(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed) return '';

  try {
    const obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== 'object') return trimmed;

    // Direct string fields (most common formats)
    if (typeof obj.content === 'string' && obj.content.trim()) {
      return obj.content.trim();
    }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message.trim();
    }
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return obj.text.trim();
    }

    // Claude Code JSONL: { type: 'message', message: { role, content: [...] } }
    if (obj.message && typeof obj.message === 'object') {
      const msg = obj.message;
      if (typeof msg.content === 'string' && msg.content.trim()) {
        return msg.content.trim();
      }
      if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter(c => c && c.type === 'text' && typeof c.text === 'string')
          .map(c => c.text.trim())
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      }
    }

    // Array content field
    if (Array.isArray(obj.content)) {
      const text = obj.content
        .filter(c => c && c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text.trim())
        .filter(Boolean)
        .join(' ');
      if (text) return text;
    }

    // Fallback: serialize the whole object
    return JSON.stringify(obj);
  } catch (_e) {
    // Not valid JSON — use raw line as text
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// FTS query escaping
// ---------------------------------------------------------------------------

/**
 * Escape a user-supplied query string for safe use in FTS5 MATCH expressions.
 * Wraps the query in double quotes (phrase query) to neutralize all FTS5
 * special characters: *, ", OR, AND, NOT, NEAR, column: filters.
 * Internal double quotes are doubled per SQLite FTS5 phrase-quoting rules.
 *
 * @param {string} query
 * @returns {string} Safe FTS5 query string
 */
function escapeFtsQuery(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return '""';
  // Wrap in double quotes, escaping any internal double quotes by doubling
  return '"' + trimmed.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// Snippet generation
// ---------------------------------------------------------------------------

/**
 * Generate a ±50-character snippet around the first occurrence of any search
 * term in the content, with match terms wrapped in ** for highlighting.
 * Total snippet length is always < 200 characters.
 *
 * @param {string} content - Full text content of a matched row
 * @param {string} query   - Original (unescaped) user query
 * @returns {string} Highlighted snippet
 */
function makeSnippet(content, query) {
  if (!content) return '';

  // Extract individual terms from the query (strip FTS special chars)
  const searchTerms = (query || '')
    .replace(/[*"]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const lowerContent = content.toLowerCase();
  let bestPos = -1;
  let matchedTerm = '';

  for (const term of searchTerms) {
    const lowerTerm = term.toLowerCase();
    const pos = lowerContent.indexOf(lowerTerm);
    if (pos !== -1) {
      bestPos = pos;
      matchedTerm = term;
      break;
    }
  }

  let rawSnippet;
  if (bestPos === -1) {
    // No direct match found; return truncated start (FTS5 may stem/normalize)
    rawSnippet = content.slice(0, 150);
    if (content.length > 150) rawSnippet += '...';
  } else {
    // Extract ±50 chars around match
    const termLen = matchedTerm.length;
    const start = Math.max(0, bestPos - 50);
    const end = Math.min(content.length, bestPos + termLen + 50);

    rawSnippet = content.slice(start, end);

    // Add ellipsis markers for truncation
    if (start > 0) rawSnippet = '...' + rawSnippet;
    if (end < content.length) rawSnippet += '...';
  }

  // Ensure the raw snippet is short enough before highlighting
  // (highlighting adds ** chars; keep base under 180 to stay under 200 after highlighting)
  if (rawSnippet.length > 180) {
    rawSnippet = rawSnippet.slice(0, 177) + '...';
  }

  // Apply ** highlighting for all matched terms
  let highlighted = rawSnippet;
  for (const term of searchTerms) {
    if (!term) continue;
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTerm, 'gi');
    highlighted = highlighted.replace(regex, m => `**${m}**`);
  }

  // Final length guard: must be < 200 chars
  if (highlighted.length >= 200) {
    highlighted = highlighted.slice(0, 197) + '...';
  }

  return highlighted;
}

// ---------------------------------------------------------------------------
// SessionIndex class
// ---------------------------------------------------------------------------

/**
 * SQLite FTS5 full-text search index over session JSONL log files.
 *
 * @example
 *   const idx = new SessionIndex('/path/to/sessions.db');
 *   idx.indexSession('abc123', '/path/to/session.jsonl');
 *   const results = idx.search('authentication bug');
 *   const recent = idx.getRecentSessions(5);
 *   idx.close();
 */
class SessionIndex {
  /**
   * @param {string} [dbPath] - Path to the SQLite database file.
   *   Defaults to `.claude/data/sessions.db` in the current working directory.
   */
  constructor(dbPath) {
    this._dbPath = dbPath || DEFAULT_DB_PATH;
    /** @type {import('better-sqlite3').Database|null} */
    this._db = null;
  }

  // ---------------------------------------------------------------------------
  // Private: lazy DB initialisation
  // ---------------------------------------------------------------------------

  /**
   * Get (or lazily create) the SQLite database connection.
   * Initialises the FTS5 schema on first use.
   *
   * @returns {import('better-sqlite3').Database}
   */
  _getDb() {
    if (this._db) return this._db;

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(this._dbPath), { recursive: true });

    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');

    this._initSchema();
    return this._db;
  }

  /**
   * Create FTS5 virtual table and sessions_meta table if not already present.
   */
  _initSchema() {
    this._db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_fts USING fts5(
        sessionId UNINDEXED,
        lineNumber UNINDEXED,
        content,
        tokenize = 'porter ascii'
      );

      CREATE TABLE IF NOT EXISTS sessions_meta (
        sessionId  TEXT    PRIMARY KEY,
        indexedAt  INTEGER NOT NULL
      );
    `);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Index (or re-index) a session's JSONL log file into the FTS5 table.
   * If the session was previously indexed its rows are replaced.
   *
   * @param {string} sessionId   - Unique identifier for the session.
   * @param {string} jsonlPath   - Absolute path to the JSONL log file.
   */
  indexSession(sessionId, jsonlPath) {
    const db = this._getDb();

    const raw = fs.readFileSync(jsonlPath, 'utf8');
    const lines = raw.split('\n');

    // Remove stale rows for this session
    db.prepare('DELETE FROM session_fts WHERE sessionId = ?').run(sessionId);

    // Prepare bulk insert as a transaction for performance
    const insert = db.prepare(
      'INSERT INTO session_fts(sessionId, lineNumber, content) VALUES (?, ?, ?)'
    );

    const insertAll = db.transaction(entries => {
      for (const entry of entries) {
        insert.run(sessionId, entry.lineNumber, entry.content);
      }
    });

    const entries = [];
    lines.forEach((line, idx) => {
      const text = extractText(line);
      if (text) {
        entries.push({ lineNumber: idx, content: text });
      }
    });

    if (entries.length > 0) {
      insertAll(entries);
    }

    // Upsert session metadata
    db.prepare('INSERT OR REPLACE INTO sessions_meta(sessionId, indexedAt) VALUES (?, ?)').run(
      sessionId,
      Date.now()
    );
  }

  /**
   * Perform an FTS5 full-text search over all indexed sessions.
   * FTS5 special characters in the query are automatically escaped.
   *
   * @param {string} query - Search query string.
   * @param {object} [options]
   * @param {number} [options.limit=20] - Maximum number of results to return.
   * @returns {Array<{sessionId: string, lineNumber: number, snippet: string, score: number}>}
   */
  search(query, options) {
    const db = this._getDb();
    const limit = (options && options.limit) || 20;
    const escapedQuery = escapeFtsQuery(query);

    let rows;
    try {
      rows = db
        .prepare(
          `SELECT sessionId, lineNumber, content, rank
           FROM session_fts
           WHERE session_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(escapedQuery, limit);
    } catch (err) {
      // If the query still fails after escaping (e.g., empty phrase), return []
      const msg = err.message || '';
      if (msg.includes('fts5:') || msg.includes('syntax error') || msg.includes('no such table')) {
        return [];
      }
      throw err;
    }

    return rows.map(row => ({
      sessionId: row.sessionId,
      lineNumber: row.lineNumber,
      snippet: makeSnippet(row.content, query),
      // FTS5 rank is negative BM25 (lower = more relevant); negate for intuitive score
      score: -row.rank,
    }));
  }

  /**
   * Return the N most recently indexed sessions.
   *
   * @param {number} [limit=10] - Maximum number of sessions to return.
   * @returns {Array<{sessionId: string, indexedAt: number}>}
   */
  getRecentSessions(limit) {
    const db = this._getDb();
    const n = limit != null ? limit : 10;

    return db
      .prepare(
        `SELECT sessionId, indexedAt
         FROM sessions_meta
         ORDER BY indexedAt DESC
         LIMIT ?`
      )
      .all(n);
  }

  /**
   * Close the underlying SQLite database connection.
   * Safe to call multiple times.
   */
  close() {
    if (this._db) {
      try {
        this._db.close();
      } catch (_e) {
        // Ignore close errors
      }
      this._db = null;
    }
  }
}

module.exports = { SessionIndex, extractText, escapeFtsQuery, makeSnippet };
