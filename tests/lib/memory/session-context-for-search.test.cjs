'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getContextForSearch,
} = require('../../../.claude/lib/memory/session-context-for-search.cjs');

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

test('getContextForSearch prefers STM recent_messages when present', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'context-search-'));
  try {
    const stmPath = path.join(
      projectRoot,
      '.claude',
      'context',
      'memory',
      'stm',
      'session_current.json'
    );
    writeJson(stmPath, {
      session_id: 'stm-1',
      recent_messages: [
        { role: 'user', content: 'Need help with authentication flow' },
        { role: 'assistant', content: 'We can outline the steps' },
      ],
    });

    const result = getContextForSearch('authentication', { projectRoot });
    assert.deepEqual(result.recentMessages, [
      '[user]: Need help with authentication flow',
      '[assistant]: We can outline the steps',
    ]);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('getContextForSearch ranks summaries by query match and recency', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'context-search-'));
  try {
    const mtmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'mtm');
    fs.mkdirSync(mtmDir, { recursive: true });

    const summaryOld = path.join(mtmDir, 'session_old.summary.md');
    const summaryNew = path.join(mtmDir, 'session_new.summary.md');
    fs.writeFileSync(summaryOld, 'Summary about deployment pipeline');
    fs.writeFileSync(summaryNew, 'Summary about authentication and tokens');

    const older = Date.now() - 10000;
    fs.utimesSync(summaryOld, older / 1000, older / 1000);

    const result = getContextForSearch('authentication', {
      projectRoot,
      maxArchives: 2,
    });

    assert.equal(result.summaries.length, 2);
    assert.equal(result.summaries[0], 'Summary about authentication and tokens');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
