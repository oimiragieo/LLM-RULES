const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('settings.json wires PostToolUseFailure hooks for metrics and reflection', () => {
  const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  const hooks = settings?.hooks?.PostToolUseFailure;
  assert.ok(Array.isArray(hooks), 'PostToolUseFailure hooks must be configured');
  assert.ok(hooks.length >= 1, 'PostToolUseFailure must have at least one matcher');

  const commands = hooks
    .flatMap(entry => (Array.isArray(entry.hooks) ? entry.hooks : []))
    .map(h => h.command)
    .filter(Boolean);

  assert.ok(
    commands.includes('node .claude/hooks/metrics/post-tool-metrics-unified.cjs'),
    'PostToolUseFailure should invoke metrics hook'
  );
  assert.ok(
    commands.includes('node .claude/hooks/reflection/unified-reflection-handler.cjs'),
    'PostToolUseFailure should invoke reflection hook for task/bash failures'
  );
});
