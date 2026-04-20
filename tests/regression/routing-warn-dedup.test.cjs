/* Agent: developer | Task: #P02 | Session: 2026-04-19 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const helperPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'routing',
  'routing-warn-dedupe.cjs'
);

function loadHelper() {
  delete require.cache[require.resolve(helperPath)];
  return require(helperPath);
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'routing-warn-dedupe-'));
}

test('routing-warn-dedupe: helper module exists and exports emitRoutingWarn', () => {
  const helper = loadHelper();
  assert.equal(typeof helper.emitRoutingWarn, 'function', 'must export emitRoutingWarn');
  assert.equal(typeof helper.flushPending, 'function', 'must export flushPending');
  assert.equal(typeof helper._resetForTests, 'function', 'must export _resetForTests');
});

test('routing-warn-dedupe: 5 identical emits within TTL produce ONE log entry', () => {
  const helper = loadHelper();
  helper._resetForTests();

  const tmp = mkTmpDir();
  const logPath = path.join(tmp, 'routing-warn.log');
  const issuesPath = path.join(tmp, 'issues.md');
  fs.writeFileSync(issuesPath, '# Issues\n', 'utf8');

  const entry = 'Developer task routing warned. Keyword "fix" suggests specialist "developer".';

  for (let i = 0; i < 5; i += 1) {
    helper.emitRoutingWarn(entry, { logPath, ttlMs: 60_000 });
  }

  const logContent = fs.readFileSync(logPath, 'utf8');
  const matchCount = (logContent.match(/ROUTING WARN/g) || []).length;
  assert.equal(matchCount, 1, `expected 1 entry, got ${matchCount}: ${logContent}`);

  // issues.md must be untouched
  const issuesContent = fs.readFileSync(issuesPath, 'utf8');
  assert.equal(issuesContent, '# Issues\n', 'issues.md must not be written by routing warns');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('routing-warn-dedupe: flushPending emits suppressed count summary', () => {
  const helper = loadHelper();
  helper._resetForTests();

  const tmp = mkTmpDir();
  const logPath = path.join(tmp, 'routing-warn.log');

  const entry = 'Test entry for suppression count.';

  for (let i = 0; i < 7; i += 1) {
    helper.emitRoutingWarn(entry, { logPath, ttlMs: 60_000 });
  }

  helper.flushPending(logPath);

  const logContent = fs.readFileSync(logPath, 'utf8');
  // Expect first entry + a suppressed-count summary mentioning 6 suppressed
  assert.match(logContent, /suppressed 6/i, `expected "suppressed 6" summary, got: ${logContent}`);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('routing-warn-dedupe: different content bypasses dedupe', () => {
  const helper = loadHelper();
  helper._resetForTests();

  const tmp = mkTmpDir();
  const logPath = path.join(tmp, 'routing-warn.log');

  helper.emitRoutingWarn('Entry A', { logPath, ttlMs: 60_000 });
  helper.emitRoutingWarn('Entry B', { logPath, ttlMs: 60_000 });
  helper.emitRoutingWarn('Entry C', { logPath, ttlMs: 60_000 });

  const logContent = fs.readFileSync(logPath, 'utf8');
  assert.match(logContent, /Entry A/);
  assert.match(logContent, /Entry B/);
  assert.match(logContent, /Entry C/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('routing-warn-dedupe: rotates log at 1MB threshold', () => {
  const helper = loadHelper();
  helper._resetForTests();

  const tmp = mkTmpDir();
  const logPath = path.join(tmp, 'routing-warn.log');

  // Pre-populate log with >1MB so next write triggers rotation.
  const bigBuf = Buffer.alloc(1024 * 1024 + 10, 'x');
  fs.writeFileSync(logPath, bigBuf);

  helper.emitRoutingWarn('Post-rotation entry', { logPath, ttlMs: 60_000 });

  assert.ok(fs.existsSync(`${logPath}.1`), `expected rotated file ${logPath}.1`);

  const newLog = fs.readFileSync(logPath, 'utf8');
  assert.match(newLog, /Post-rotation entry/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('routing-warn-dedupe: checks-task.cjs writer no longer writes to issues.md', () => {
  const tmp = mkTmpDir();
  const fakeClaudeDir = path.join(tmp, '.claude', 'context', 'memory');
  fs.mkdirSync(fakeClaudeDir, { recursive: true });
  const issuesPath = path.join(fakeClaudeDir, 'issues.md');
  fs.writeFileSync(issuesPath, '# Issues\n', 'utf8');

  // Read the writer source and assert it no longer contains the direct
  // fs.appendFileSync to issues.md pattern for ROUTING WARN.
  const writerPath = path.resolve(
    __dirname,
    '..',
    '..',
    '.claude',
    'hooks',
    'routing',
    'routing-guard-core.checks-task.cjs'
  );
  const src = fs.readFileSync(writerPath, 'utf8');

  // The writer must NOT have a direct appendFileSync to issues.md for ROUTING WARN.
  const badPattern = /\[ROUTING WARN\][\s\S]{0,200}?appendFileSync\(issuesPath/;
  assert.ok(
    !badPattern.test(src),
    'routing-guard-core.checks-task.cjs still writes [ROUTING WARN] to issues.md directly'
  );

  // And it MUST use the new dedupe helper.
  assert.match(
    src,
    /routing-warn-dedupe/,
    'routing-guard-core.checks-task.cjs must import routing-warn-dedupe helper'
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
