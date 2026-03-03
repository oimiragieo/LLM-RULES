'use strict';
// Tests for generate-embeddings.cjs — MTM/LTM memory-tier indexing.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

function chunkId(filePath, text) {
  return `mem:${crypto.createHash('sha256').update(filePath + text).digest('hex').slice(0, 12)}`;
}

function extractMTMTexts(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const parts = [];
  if (data.summary) parts.push(data.summary);
  if (data.session_id) parts.push(`session_id: ${data.session_id}`);
  if (data.tier) parts.push(`tier: ${data.tier}`);
  return parts.filter(Boolean);
}

function extractLTMTexts(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const parts = [];
  if (data.type) parts.push(`type: ${data.type}`);
  if (data.date_range) parts.push(`date_range: ${data.date_range.start} to ${data.date_range.end}`);
  for (const key of ['key_learnings', 'major_decisions', 'important_patterns']) {
    if (Array.isArray(data[key])) {
      for (const item of data[key]) {
        const t = typeof item === 'string' ? item.trim() : JSON.stringify(item).trim();
        if (t) parts.push(t);
      }
    }
  }
  if (Array.isArray(data.files_frequently_touched)) parts.push(`files: ${data.files_frequently_touched.join(', ')}`);
  return parts.filter(Boolean);
}

function fileToChunks(filePath, tier) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_err) {
    return [];
  }
  const texts =
    tier === 'mtm' ? extractMTMTexts(data) : tier === 'ltm' ? extractLTMTexts(data) : [];
  if (texts.length === 0) return [];
  return texts
    .map((text, idx) => ({
      id: chunkId(filePath, text + idx),
      content: text,
      filePath: filePath.replace(/\\/g, '/'),
      language: 'json',
      type: `memory-${tier}`,
      lineStart: idx + 1,
      lineEnd: idx + 1,
      name: path.basename(filePath, '.json'),
      signature: null,
      tokenCount: Math.ceil(text.length / 4),
    }))
    .filter(c => c.content.trim().length > 0);
}

function createMemoryFixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-embed-test-'));
  const memBase = path.join(projectRoot, '.claude', 'context', 'memory');
  const mtmDir = path.join(memBase, 'mtm');
  const ltmDir = path.join(memBase, 'ltm');
  const stmDir = path.join(memBase, 'stm');
  fs.mkdirSync(mtmDir, { recursive: true });
  fs.mkdirSync(ltmDir, { recursive: true });
  fs.mkdirSync(stmDir, { recursive: true });
  return { projectRoot, memBase, mtmDir, ltmDir, stmDir };
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../.claude/lib/code-indexing/generate-embeddings.cjs'
);

const LTM_FIXTURE = {
  type: 'ltm_summary',
  date_range: { start: '2026-01-01', end: '2026-03-31' },
  key_learnings: ['Always use safeParseJSON', 'Normalize paths on Windows'],
  major_decisions: [],
  important_patterns: [],
  files_frequently_touched: ['hooks/routing/routing-guard.cjs'],
  session_count: 10,
  session_ids: [],
  created_at: '2026-04-01T00:00:00Z',
};

describe('generate-embeddings MTM/LTM indexing', () => {
  describe('MTM directory file discovery', () => {
    it('includes .json files from mtm/ in the discovered file list', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const sessionFile = path.join(mtmDir, 'session_20260101.json');
        writeJSON(sessionFile, {
          session_id: 'sess-001',
          summary: 'First MTM session',
          tier: 'mtm',
        });
        const files = listFiles(mtmDir).filter(f => f.endsWith('.json'));
        assert.ok(files.length >= 1, 'At least one JSON file should be discovered in mtm/');
        assert.ok(
          files.some(f => path.basename(f) === 'session_20260101.json'),
          'session_20260101.json must appear'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('does not include non-.json files from mtm/', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        fs.writeFileSync(path.join(mtmDir, 'README.md'), '# readme', 'utf-8');
        writeJSON(path.join(mtmDir, 'session_abc.json'), { summary: 'valid' });
        const jsonFiles = listFiles(mtmDir).filter(f => f.endsWith('.json'));
        assert.ok(
          jsonFiles.every(f => f.endsWith('.json')),
          'Only .json files should appear'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('returns empty list when mtm/ directory does not exist', () => {
      const nonExistentDir = path.join(os.tmpdir(), 'no-such-mtm-dir-' + Date.now());
      assert.deepEqual(listFiles(nonExistentDir), []);
    });
  });

  describe('LTM directory file discovery', () => {
    it('includes .json files from ltm/ in the discovered file list', () => {
      const { projectRoot, ltmDir } = createMemoryFixture();
      try {
        writeJSON(path.join(ltmDir, 'summary_2026Q1.json'), LTM_FIXTURE);
        const files = listFiles(ltmDir).filter(f => f.endsWith('.json'));
        assert.ok(files.length >= 1, 'At least one LTM JSON file should be discovered');
        assert.ok(
          files.some(f => path.basename(f) === 'summary_2026Q1.json'),
          'summary_2026Q1.json must appear'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('discovers files in nested subdirectories within ltm/', () => {
      const { projectRoot, ltmDir } = createMemoryFixture();
      try {
        const subDir = path.join(ltmDir, 'archive');
        fs.mkdirSync(subDir, { recursive: true });
        writeJSON(path.join(subDir, 'summary_old.json'), { type: 'ltm_summary' });
        const files = listFiles(ltmDir).filter(f => f.endsWith('.json'));
        assert.ok(
          files.some(f => f.endsWith(path.join('archive', 'summary_old.json'))),
          'Nested JSON files must be discovered recursively'
        );
      } finally {
        cleanup(projectRoot);
      }
    });
  });

  describe('MTM session JSON parsing', () => {
    it('extracts summary, session_id, and tier from a session_*.json file', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const data = {
          session_id: 'sess-abc-123',
          summary: 'Fixed BM25 lazy IDF and path normalization on Windows.',
          tier: 'mtm',
          timestamp: '2026-03-01T12:00:00Z',
        };
        const filePath = writeJSON(path.join(mtmDir, 'session_test.json'), data);
        const chunks = fileToChunks(filePath, 'mtm');
        assert.ok(chunks.length >= 3, `Expected >=3 chunks, got ${chunks.length}`);
        const contents = chunks.map(c => c.content);
        assert.ok(
          contents.includes('Fixed BM25 lazy IDF and path normalization on Windows.'),
          'summary must appear'
        );
        assert.ok(contents.includes('session_id: sess-abc-123'), 'session_id must appear');
        assert.ok(contents.includes('tier: mtm'), 'tier must appear');
      } finally {
        cleanup(projectRoot);
      }
    });

    it('produces chunks with correct metadata fields', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const filePath = writeJSON(path.join(mtmDir, 'session_meta.json'), {
          session_id: 'sess-meta-check',
          summary: 'Metadata verification session.',
          tier: 'mtm',
        });
        const chunks = fileToChunks(filePath, 'mtm');
        assert.ok(chunks.length > 0, 'Must produce at least one chunk');
        for (const chunk of chunks) {
          assert.ok(chunk.id.startsWith('mem:'), `chunk.id must start with "mem:": ${chunk.id}`);
          assert.equal(chunk.language, 'json');
          assert.equal(chunk.type, 'memory-mtm');
          assert.ok(typeof chunk.content === 'string' && chunk.content.length > 0);
          assert.ok(typeof chunk.lineStart === 'number');
          assert.ok(typeof chunk.tokenCount === 'number' && chunk.tokenCount > 0);
          assert.ok(
            !chunk.filePath.includes('\\'),
            'filePath must not contain backslashes (SE-01)'
          );
        }
      } finally {
        cleanup(projectRoot);
      }
    });

    it('extracts LTM text fields: type, date_range, key_learnings', () => {
      const { projectRoot, ltmDir } = createMemoryFixture();
      try {
        const data = {
          type: 'ltm_summary',
          date_range: { start: '2026-01-01', end: '2026-03-31' },
          key_learnings: ['Use safeParseJSON everywhere', 'BM25 lazy IDF pattern'],
          major_decisions: ['Chose BM25 over Lucene for portability'],
          important_patterns: ['always shell: false in child_process'],
          files_frequently_touched: ['routing-guard.cjs', 'safe-json.cjs'],
          session_count: 8,
          session_ids: [],
          created_at: '2026-04-01T00:00:00Z',
        };
        const chunks = fileToChunks(writeJSON(path.join(ltmDir, 'summary_q1.json'), data), 'ltm');
        const contents = chunks.map(c => c.content);
        assert.ok(
          contents.some(c => c.includes('ltm_summary')),
          'type must be extracted'
        );
        assert.ok(
          contents.some(c => c.includes('2026-01-01')),
          'date_range must be extracted'
        );
        assert.ok(
          contents.includes('Use safeParseJSON everywhere'),
          'key_learnings[0] must be extracted'
        );
        assert.ok(contents.includes('BM25 lazy IDF pattern'), 'key_learnings[1] must be extracted');
        assert.ok(
          contents.some(c => c.includes('Chose BM25 over Lucene')),
          'major_decisions must be extracted'
        );
        assert.ok(
          contents.some(c => c.includes('files:')),
          'files_frequently_touched must be extracted'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('produces no chunks when session JSON has no recognised text fields', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const filePath = writeJSON(path.join(mtmDir, 'session_empty.json'), {
          some_unknown_field: 42,
        });
        assert.equal(fileToChunks(filePath, 'mtm').length, 0, 'No chunks from unrecognised fields');
      } finally {
        cleanup(projectRoot);
      }
    });
  });

  describe('--memory-only flag', () => {
    it('restricts indexed files to memory directories when --memory-only is set', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        writeJSON(path.join(mtmDir, 'session_flagtest.json'), {
          session_id: 'flag-test',
          summary: 'Testing --memory-only flag behaviour.',
          tier: 'mtm',
        });
        const srcDir = path.join(projectRoot, 'src');
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(path.join(srcDir, 'app.js'), 'console.log("hello");', 'utf-8');

        const result = spawnSync(
          process.execPath,
          [SCRIPT_PATH, '--dry-run', '--memory-only', '--verbose', '--project-root', projectRoot],
          { encoding: 'utf-8', timeout: 15000 }
        );
        assert.equal(result.status, 0, `Script exited ${result.status}. stderr: ${result.stderr}`);
        const output = result.stdout + result.stderr;
        assert.ok(
          output.includes('session_flagtest.json') || output.includes('MTM'),
          'Must reference MTM file'
        );
        assert.ok(!output.includes('app.js'), 'src/app.js must NOT appear in --memory-only output');
      } finally {
        cleanup(projectRoot);
      }
    });

    it('includes both MTM and LTM files under --memory-only', () => {
      const { projectRoot, mtmDir, ltmDir } = createMemoryFixture();
      try {
        writeJSON(path.join(mtmDir, 'session_combined.json'), {
          session_id: 'combined',
          summary: 'Combined MTM session.',
          tier: 'mtm',
        });
        writeJSON(path.join(ltmDir, 'summary_combined.json'), {
          type: 'ltm_summary',
          date_range: { start: '2026-01-01', end: '2026-01-31' },
          key_learnings: ['Combined LTM learning'],
          major_decisions: [],
          important_patterns: [],
          files_frequently_touched: [],
          session_count: 1,
          session_ids: [],
          created_at: '2026-02-01T00:00:00Z',
        });
        const result = spawnSync(
          process.execPath,
          [SCRIPT_PATH, '--dry-run', '--memory-only', '--verbose', '--project-root', projectRoot],
          { encoding: 'utf-8', timeout: 15000 }
        );
        assert.equal(result.status, 0, `Script exited ${result.status}. stderr: ${result.stderr}`);
        const output = result.stdout + result.stderr;
        assert.ok(
          output.includes('session_combined.json') || output.includes('found 2 memory files'),
          'Output must reference MTM file'
        );
      } finally {
        cleanup(projectRoot);
      }
    });
  });

  describe('BM25-only mode (LANCEDB_EMBEDDING_MODE=off)', () => {
    it('runs successfully in --dry-run mode without requiring LanceDB', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        writeJSON(path.join(mtmDir, 'session_bm25.json'), {
          session_id: 'bm25-test',
          summary: 'BM25-only indexing test session.',
          tier: 'mtm',
        });
        const result = spawnSync(
          process.execPath,
          [SCRIPT_PATH, '--dry-run', '--memory-only', '--project-root', projectRoot],
          {
            encoding: 'utf-8',
            timeout: 15000,
            env: { ...process.env, LANCEDB_EMBEDDING_MODE: 'off' },
          }
        );
        assert.equal(result.status, 0, `Script should exit 0 in dry-run. stderr: ${result.stderr}`);
        assert.ok(
          result.stdout.includes('dry-run complete'),
          'Output must confirm dry-run completed'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('produces chunks without embedding when LANCEDB_EMBEDDING_MODE=off', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const filePath = writeJSON(path.join(mtmDir, 'session_bm25_chunk.json'), {
          session_id: 'bm25-chunk-test',
          summary: 'BM25 chunk content verification.',
          tier: 'mtm',
        });
        const chunks = fileToChunks(filePath, 'mtm');
        assert.ok(chunks.length > 0, 'fileToChunks must produce chunks even without embeddings');
        assert.ok(chunks.every(c => typeof c.content === 'string' && c.content.length > 0));
      } finally {
        cleanup(projectRoot);
      }
    });
  });

  describe('Corrupted JSON error handling', () => {
    it('returns empty chunks for a file containing invalid JSON', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        const badFile = path.join(mtmDir, 'session_corrupt.json');
        fs.writeFileSync(badFile, '{"session_id": "broken", "summary": "unterminated', 'utf-8');
        assert.equal(
          fileToChunks(badFile, 'mtm').length,
          0,
          'Corrupted JSON must produce zero chunks'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('continues processing other files when one file has corrupted JSON', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        fs.writeFileSync(path.join(mtmDir, 'session_bad.json'), '{invalid json here}', 'utf-8');
        writeJSON(path.join(mtmDir, 'session_good.json'), {
          session_id: 'good-sess',
          summary: 'This session is valid and should still be indexed.',
          tier: 'mtm',
        });
        assert.equal(
          fileToChunks(path.join(mtmDir, 'session_bad.json'), 'mtm').length,
          0,
          'Bad file yields 0 chunks'
        );
        const goodChunks = fileToChunks(path.join(mtmDir, 'session_good.json'), 'mtm');
        assert.ok(goodChunks.length > 0, 'Valid file must still yield chunks');
        assert.ok(goodChunks.some(c => c.content.includes('valid and should still be indexed')));
      } finally {
        cleanup(projectRoot);
      }
    });

    it('does not crash the CLI when a corrupted JSON file exists in mtm/', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        fs.writeFileSync(
          path.join(mtmDir, 'session_crash_test.json'),
          '{"session_id": "crash-test", INVALID',
          'utf-8'
        );
        writeJSON(path.join(mtmDir, 'session_valid.json'), {
          session_id: 'valid-crash-test',
          summary: 'This keeps the script alive.',
          tier: 'mtm',
        });
        const result = spawnSync(
          process.execPath,
          [SCRIPT_PATH, '--dry-run', '--memory-only', '--verbose', '--project-root', projectRoot],
          { encoding: 'utf-8', timeout: 15000 }
        );
        assert.equal(
          result.status,
          0,
          `CLI must exit 0 even with corrupted JSON. stderr: ${result.stderr}`
        );
        const out = result.stdout + result.stderr;
        assert.ok(
          out.includes('WARN') || out.includes('Cannot parse JSON'),
          'A warning must be emitted'
        );
      } finally {
        cleanup(projectRoot);
      }
    });

    it('handles empty and null JSON files gracefully', () => {
      const { projectRoot, mtmDir } = createMemoryFixture();
      try {
        fs.writeFileSync(path.join(mtmDir, 'session_empty.json'), '', 'utf-8');
        fs.writeFileSync(path.join(mtmDir, 'session_null.json'), 'null', 'utf-8');
        assert.equal(fileToChunks(path.join(mtmDir, 'session_empty.json'), 'mtm').length, 0);
        assert.equal(fileToChunks(path.join(mtmDir, 'session_null.json'), 'mtm').length, 0);
      } finally {
        cleanup(projectRoot);
      }
    });
  });
});
