const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Hook Integrity: all hooks in settings.json exist on disk', () => {
  const settingsPath = path.join(process.cwd(), '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  const deadHooks = [];

  // Extract all hook commands from settings.json
  Object.values(settings.hooks || {}).forEach(hookArray => {
    if (!Array.isArray(hookArray)) return;

    hookArray.forEach(hookGroup => {
      if (!hookGroup.hooks || !Array.isArray(hookGroup.hooks)) return;

      hookGroup.hooks.forEach(hook => {
        if (!hook.command) return;

        // Extract file path from command - handle both formats:
        // 1. "node .claude/hooks/foo.cjs"
        // 2. 'cd "C:/dev/..." && node .claude/hooks/foo.cjs'
        let file;
        const nodeMatch = hook.command.match(/node\s+([^\s"]+\.(?:cjs|mjs|js))/);
        if (nodeMatch) {
          file = nodeMatch[1];
        } else {
          file = hook.command.replace(/^node\s+/, '').split(/\s+/)[0];
        }
        const fullPath = path.join(process.cwd(), file);

        if (!fs.existsSync(fullPath)) {
          deadHooks.push({ command: hook.command, file });
        }
      });
    });
  });

  // Assert zero dead hooks
  assert.strictEqual(
    deadHooks.length,
    0,
    `Found ${deadHooks.length} dead hooks:\n${deadHooks.map(h => `  - ${h.file}`).join('\n')}`
  );
});
