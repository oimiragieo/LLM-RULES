const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

test('scoped active hooks do not fall back to process.cwd() for project-root discovery', () => {
  const hookFiles = [
    '.claude/hooks/monitoring/trajectory-logger.cjs',
    '.claude/hooks/session/stale-task-detector.cjs',
  ];

  for (const relativePath of hookFiles) {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /process\.cwd\(\)/,
      `${relativePath} should use deterministic project-root discovery instead of process.cwd()`
    );
  }
});
