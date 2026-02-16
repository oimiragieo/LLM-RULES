'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let validator;
try {
  validator = require('../../scripts/validation/validate-hooks-doc-sync.cjs');
} catch (_err) {
  validator = null;
}

test('validator module exists and exports collectActiveHookBasenames', () => {
  assert.ok(validator, 'validate-hooks-doc-sync.mjs should be loadable');
  assert.equal(typeof validator.collectActiveHookBasenames, 'function');
});

test('collectActiveHookBasenames extracts command basenames from settings hooks', () => {
  assert.ok(validator, 'validator should be available');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-sync-'));
  const settingsPath = path.join(tmpDir, 'settings.json');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Task',
              hooks: [
                {
                  type: 'command',
                  command: 'node .claude/hooks/routing/spawn-prompt-assembler.cjs',
                },
                { type: 'command', command: 'node .claude/hooks/routing/pre-task-unified.cjs' },
              ],
            },
          ],
        },
      },
      null,
      2
    )
  );

  const names = validator.collectActiveHookBasenames(settingsPath);
  assert.deepEqual(names, ['pre-task-unified.cjs', 'spawn-prompt-assembler.cjs']);
});

test('findMissingHooks returns undocumented hooks not in exclusions', () => {
  assert.ok(validator, 'validator should be available');

  const active = [
    'pre-task-unified.cjs',
    'spawn-prompt-assembler.cjs',
    'post-tool-metrics-unified.cjs',
  ];
  const docsText = '... pre-task-unified.cjs ... spawn-prompt-assembler.cjs ...';
  const missing = validator.findMissingHooks(active, docsText, ['post-tool-metrics-unified.cjs']);

  assert.deepEqual(missing, []);
});
