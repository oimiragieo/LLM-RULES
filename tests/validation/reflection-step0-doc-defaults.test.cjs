'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

test('docs set REFLECTION_STEP0_ENFORCEMENT default to block', () => {
  const enforcementDoc = read('.claude/docs/@ENFORCEMENT_HOOKS.md');
  const hookMapDoc = read('.claude/docs/@HOOK_AGENT_MAP.md');

  assert.match(
    enforcementDoc,
    /REFLECTION_STEP0_ENFORCEMENT=block\|warn\|off\s+# Default:\s*block/
  );
  assert.match(
    hookMapDoc,
    /\|\s*`REFLECTION_STEP0_ENFORCEMENT`\s*\|\s*reflection-step0-guard\.cjs\s*\|\s*block\s*\|/
  );
  assert.match(hookMapDoc, /REFLECTION_STEP0_ENFORCEMENT=block/);
});

test('docs set TASKLIST_FIRST_ENFORCEMENT default to block', () => {
  const enforcementDoc = read('.claude/docs/@ENFORCEMENT_HOOKS.md');
  const hookMapDoc = read('.claude/docs/@HOOK_AGENT_MAP.md');

  assert.match(enforcementDoc, /TASKLIST_FIRST_ENFORCEMENT=block\|warn\|off\s+# Default:\s*block/);
  assert.match(
    hookMapDoc,
    /\|\s*`TASKLIST_FIRST_ENFORCEMENT`\s*\|\s*routing-guard\.cjs\s*\|\s*block\s*\|/
  );
});
