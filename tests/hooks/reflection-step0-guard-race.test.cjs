#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'reflection',
  'reflection-step0-guard.cjs'
);
const SPAWN_REQUEST_PATH = path.normalize(
  `${PROJECT_ROOT}/.claude/context/runtime/reflection-spawn-request.json`
);

function buildPreloadScript() {
  const target = SPAWN_REQUEST_PATH.replace(/\\/g, '\\\\');
  return `
const fs = require('node:fs');
const target = "${target}";
const origRead = fs.readFileSync;
let calls = 0;
fs.readFileSync = function patched(file, ...rest) {
  const normalized = String(file).replace(/\\\\/g, '/').toLowerCase();
  const expected = target.replace(/\\\\/g, '/').toLowerCase();
  if (normalized === expected) {
    calls += 1;
    if (calls === 1) {
      return '[{"id":"req-1"}]';
    }
    return '[]';
  }
  return origRead.call(this, file, ...rest);
};
`;
}

test('reflection-step0-guard does not block when pending queue clears between reads', () => {
  const preloadPath = path.join(
    os.tmpdir(),
    `reflection-step0-race-preload-${Date.now()}-${Math.random().toString(36).slice(2)}.cjs`
  );
  fs.writeFileSync(preloadPath, buildPreloadScript(), 'utf8');

  try {
    const payload = JSON.stringify({
      tool_name: 'TaskList',
      tool_input: {},
      session_id: 'test-step0-race',
      hook_event_name: 'PreToolUse',
    });

    const result = spawnSync('node', ['--require', preloadPath, GUARD_PATH], {
      env: {
        ...process.env,
        REFLECTION_STEP0_ENFORCEMENT: 'block',
      },
      input: payload,
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      0,
      `hook should fail-open when queue clears mid-check, stderr=${result.stderr || ''}`
    );
    assert.ok(
      !String(result.stdout || '').includes('STEP 0 REQUIRED'),
      `unexpected block message: ${result.stdout || ''}`
    );
  } finally {
    fs.rmSync(preloadPath, { force: true });
  }
});
