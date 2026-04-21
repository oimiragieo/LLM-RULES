/* Agent: developer | Task: #P01 | Session: 2026-04-19 */
/* Agent: qa | Task: #P04-M1 | Session: 2026-04-20 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const hookPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'safety',
  'bypass-audit-hook.cjs'
);

// P04: archived channel-auto-start module path (tests the BUGGY source
// directly — NOT the compat wrapper at .claude/hooks/channels/channel-auto-start.cjs
// whose ROOT is correct and would mask this bug). The archived module
// exports LOCKFILE and CHANNEL_SENTINEL_PATH; RUNTIME is derived from
// the lockfile's parent directory (they share the same RUNTIME constant
// internally).
const archivedChannelHookPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'channels',
  '_archive',
  'channel-auto-start.cjs'
);

test('bypass-audit-hook DEFAULT_AUDIT_PATH does not contain nested .claude/.claude/', () => {
  // Ensure a clean require so PROJECT_ROOT is computed freshly.
  delete require.cache[require.resolve(hookPath)];
  const hook = require(hookPath);

  assert.ok(hook && typeof hook === 'object', 'hook module must export an object');
  assert.ok(
    typeof hook.DEFAULT_AUDIT_PATH === 'string',
    'hook must export DEFAULT_AUDIT_PATH as a string'
  );

  const auditPath = hook.DEFAULT_AUDIT_PATH;

  assert.ok(
    !auditPath.includes('.claude\\.claude'),
    `DEFAULT_AUDIT_PATH must not contain nested .claude\\.claude (got: ${auditPath})`
  );
  assert.ok(
    !auditPath.includes('.claude/.claude'),
    `DEFAULT_AUDIT_PATH must not contain nested .claude/.claude (got: ${auditPath})`
  );
});

test('bypass-audit-hook PROJECT_ROOT does not contain nested .claude/.claude/', () => {
  delete require.cache[require.resolve(hookPath)];
  const hook = require(hookPath);

  assert.ok(typeof hook.PROJECT_ROOT === 'string', 'hook must export PROJECT_ROOT as a string');

  const projectRoot = hook.PROJECT_ROOT;

  assert.ok(
    !projectRoot.includes('.claude\\.claude'),
    `PROJECT_ROOT must not contain nested .claude\\.claude (got: ${projectRoot})`
  );
  assert.ok(
    !projectRoot.includes('.claude/.claude'),
    `PROJECT_ROOT must not contain nested .claude/.claude (got: ${projectRoot})`
  );
  assert.ok(
    !projectRoot.endsWith('.claude'),
    `PROJECT_ROOT must not end with .claude (got: ${projectRoot})`
  );
});

// ─── P04: _archive/channel-auto-start nested .claude/.claude/ regression ──────
// These tests directly load the ARCHIVED module (not the compat wrapper)
// to verify its resolved internal path constants do not contain a nested
// `.claude/.claude/` segment. The archived source currently uses `..×3`
// from `.claude/hooks/channels/_archive/` which resolves ROOT to `.claude/`
// instead of the project root — causing every path built from ROOT to
// gain a duplicate `.claude/` prefix. Until M2 fixes the source, these
// tests MUST FAIL.
//
// Access pattern: the module exports LOCKFILE and CHANNEL_SENTINEL_PATH
// (see module.exports at end of _archive/channel-auto-start.cjs). RUNTIME
// is not exported directly but is structurally equal to path.dirname(LOCKFILE)
// because LOCKFILE = path.join(RUNTIME, 'channel-autostart-cooldown.lock').

test('P04 _archive/channel-auto-start LOCKFILE does not contain nested .claude/.claude/', () => {
  delete require.cache[require.resolve(archivedChannelHookPath)];
  const hook = require(archivedChannelHookPath);

  assert.ok(hook && typeof hook === 'object', 'hook module must export an object');
  assert.ok(typeof hook.LOCKFILE === 'string', 'hook must export LOCKFILE as a string');

  const lockfile = hook.LOCKFILE;
  const nestedSep = `.claude${path.sep}.claude`;

  assert.ok(
    !lockfile.includes(nestedSep),
    `LOCKFILE must not contain nested ${nestedSep} (got: ${lockfile})`
  );
  // Also guard both separators to catch cross-platform leakage.
  assert.ok(
    !lockfile.includes('.claude\\.claude'),
    `LOCKFILE must not contain nested .claude\\.claude (got: ${lockfile})`
  );
  assert.ok(
    !lockfile.includes('.claude/.claude'),
    `LOCKFILE must not contain nested .claude/.claude (got: ${lockfile})`
  );
});

test('P04 _archive/channel-auto-start CHANNEL_SENTINEL_PATH does not contain nested .claude/.claude/', () => {
  delete require.cache[require.resolve(archivedChannelHookPath)];
  const hook = require(archivedChannelHookPath);

  assert.ok(
    typeof hook.CHANNEL_SENTINEL_PATH === 'string',
    'hook must export CHANNEL_SENTINEL_PATH as a string'
  );

  const sentinel = hook.CHANNEL_SENTINEL_PATH;
  const nestedSep = `.claude${path.sep}.claude`;

  assert.ok(
    !sentinel.includes(nestedSep),
    `CHANNEL_SENTINEL_PATH must not contain nested ${nestedSep} (got: ${sentinel})`
  );
  assert.ok(
    !sentinel.includes('.claude\\.claude'),
    `CHANNEL_SENTINEL_PATH must not contain nested .claude\\.claude (got: ${sentinel})`
  );
  assert.ok(
    !sentinel.includes('.claude/.claude'),
    `CHANNEL_SENTINEL_PATH must not contain nested .claude/.claude (got: ${sentinel})`
  );
});

test('P04 _archive/channel-auto-start RUNTIME (derived) does not contain nested .claude/.claude/', () => {
  delete require.cache[require.resolve(archivedChannelHookPath)];
  const hook = require(archivedChannelHookPath);

  // RUNTIME is not exported directly; derive it from LOCKFILE's dirname.
  // Internally: LOCKFILE = path.join(RUNTIME, 'channel-autostart-cooldown.lock').
  assert.ok(typeof hook.LOCKFILE === 'string', 'hook must export LOCKFILE as a string');
  const runtime = path.dirname(hook.LOCKFILE);
  const nestedSep = `.claude${path.sep}.claude`;

  assert.ok(
    !runtime.includes(nestedSep),
    `RUNTIME must not contain nested ${nestedSep} (got: ${runtime})`
  );
  assert.ok(
    !runtime.includes('.claude\\.claude'),
    `RUNTIME must not contain nested .claude\\.claude (got: ${runtime})`
  );
  assert.ok(
    !runtime.includes('.claude/.claude'),
    `RUNTIME must not contain nested .claude/.claude (got: ${runtime})`
  );
  // Positive structural assertion: RUNTIME should end with a single
  // .claude/context/runtime segment anchored at the project root.
  assert.ok(
    runtime.endsWith(path.join('.claude', 'context', 'runtime')),
    `RUNTIME must end with .claude/context/runtime (got: ${runtime})`
  );
});
