'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTaskAutoRoute } = require('../../.claude/hooks/routing/task-auto-route.cjs');

test('task-auto-route writes suggested-route.json', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-task-auto-'));
  const outputPath = path.join(tmpRoot, 'suggested-route.json');
  const payload = runTaskAutoRoute(
    { prompt: 'Review this PR for auth changes' },
    { outputPath, projectRoot: tmpRoot }
  );
  assert.ok(payload);
  assert.ok(fs.existsSync(outputPath));
  const stored = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(stored.intent, payload.intent);
});
