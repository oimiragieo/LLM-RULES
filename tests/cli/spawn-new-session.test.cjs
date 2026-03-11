const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawnTerminalWindow } = require('../../scripts/spawn-new-session.cjs');

test('spawn-new-session > exports spawnTerminalWindow', () => {
  assert.ok(typeof spawnTerminalWindow === 'function', 'Should export spawnTerminalWindow');
});

// We keep testing minimal for the CLI script itself here as the main
// behavioral validation is covered by the E2E verification of the handoff
// mechanisms in handover-detector.test.cjs and shift-change-log.test.cjs
