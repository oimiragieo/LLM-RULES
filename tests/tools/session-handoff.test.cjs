'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { main } = require('../../.claude/tools/session-handoff/session-handoff.cjs');

function makeRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-runtime-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('session-handoff can create and ack handoff entries', () => {
  const runtimeDir = makeRuntimeDir();
  const stateFile = path.join(runtimeDir, 'session-handoffs.json');
  const originalRead = fs.readFileSync;

  try {
    fs.readFileSync = (fd, enc) => {
      if (fd === 0) {
        return JSON.stringify({
          operation: 'create',
          runtimeDir,
          summary: 'handoff summary',
          filesModified: ['src/a.js'],
        });
      }
      return originalRead(fd, enc);
    };
    main();

    const entries = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].acknowledged, false);

    fs.readFileSync = (fd, enc) => {
      if (fd === 0) {
        return JSON.stringify({
          operation: 'ack',
          runtimeDir,
          id: entries[0].id,
        });
      }
      return originalRead(fd, enc);
    };
    main();

    const updated = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(updated[0].acknowledged, true);
  } finally {
    fs.readFileSync = originalRead;
    cleanup(runtimeDir);
  }
});

