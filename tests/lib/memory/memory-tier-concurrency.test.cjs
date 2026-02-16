'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  writeSTMEntry,
  summarizeOldSessions,
  readSTMEntry,
} = require('../../../.claude/lib/memory/memory-tiers.cjs');

describe('Memory tier concurrency', () => {
  test('concurrent STM writes and immediate rotation do not corrupt session state', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tier-concurrency-'));

    const writes = Array.from({ length: 5 }, (_v, idx) =>
      writeSTMEntry(
        {
          session_id: `session-${idx}`,
          timestamp: new Date().toISOString(),
          summary: `summary-${idx}`,
        },
        projectRoot
      )
    );

    const rotate = summarizeOldSessions(projectRoot, 1);
    await Promise.all([...writes, rotate]);

    const stmPath = path.join(
      projectRoot,
      '.claude',
      'context',
      'memory',
      'stm',
      'session_current.json'
    );
    if (fs.existsSync(stmPath)) {
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(stmPath, 'utf8')));
    }

    const current = readSTMEntry(projectRoot);
    if (current) {
      assert.equal(typeof current, 'object');
      assert.equal(current.__proto__?.polluted, undefined);
    }

    fs.rmSync(projectRoot, { recursive: true, force: true });
  });
});
