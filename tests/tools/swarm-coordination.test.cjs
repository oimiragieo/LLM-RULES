'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { main } = require('../../.claude/tools/swarm-coordination/swarm-coordination.cjs');

function makeRuntimeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-runtime-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('swarm-coordination records join/heartbeat/leave lifecycle', async () => {
  const runtimeDir = makeRuntimeDir();
  const stateFile = path.join(runtimeDir, 'swarm-coordination.json');

  const originalRead = fs.readFileSync;
  fs.readFileSync = (fd, enc) => {
    if (fd === 0) {
      return JSON.stringify({ operation: 'join', agentId: 'agent-1', role: 'reviewer', runtimeDir });
    }
    return originalRead(fd, enc);
  };

  try {
    main();
    const state1 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state1.agents['agent-1'].role, 'reviewer');

    fs.readFileSync = (fd, enc) => {
      if (fd === 0) {
        return JSON.stringify({ operation: 'leave', agentId: 'agent-1', runtimeDir });
      }
      return originalRead(fd, enc);
    };
    main();
    const state2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state2.agents['agent-1'], undefined);
  } finally {
    fs.readFileSync = originalRead;
    cleanup(runtimeDir);
  }
});

