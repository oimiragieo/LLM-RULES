/* Agent: developer | Task: #P01 | Session: 2026-04-19 */
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

test('bypass-audit-hook DEFAULT_AUDIT_PATH does not contain nested .claude/.claude/', () => {
  // Ensure a clean require so PROJECT_ROOT is computed freshly.
  delete require.cache[require.resolve(hookPath)];
  const hook = require(hookPath);

  assert.ok(
    hook && typeof hook === 'object',
    'hook module must export an object'
  );
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

  assert.ok(
    typeof hook.PROJECT_ROOT === 'string',
    'hook must export PROJECT_ROOT as a string'
  );

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
