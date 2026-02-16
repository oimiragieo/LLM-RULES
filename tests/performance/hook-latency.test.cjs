'use strict';

const { spawnSync } = require('child_process');
const assert = require('assert');
const test = require('node:test');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const HOOK_SCRIPT = path.join(PROJECT_ROOT, '.claude/hooks/safety/write-pretool-bundle.cjs');

// Mock input for the hook
const MOCK_INPUT = JSON.stringify({
  tool_name: 'Write',
  task_id: 'task-latency-benchmark',
  allowed_tools: ['TaskUpdate', 'Write'],
  tool_input: {
    file_path: 'test.txt',
    content: 'hello',
  },
});

test('Hook Latency Performance', async t => {
  console.log('Checking hook script:', HOOK_SCRIPT);
  if (!require('fs').existsSync(HOOK_SCRIPT)) {
    console.log('Hook script not found');
    return;
  }

  await t.test('Write PreTool Bundle should execute under 100ms', () => {
    const result = spawnSync(process.execPath, [HOOK_SCRIPT], {
      input: MOCK_INPUT,
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      env: { ...process.env, DEBUG_HOOKS: 'true' },
      windowsHide: true, // Important for performance on Windows
    });
    if (result.stderr) {
      console.log('Hook Stderr:', result.stderr);
    }

    if (result.error) throw result.error;

    const perfLine = (result.stderr || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find(
        entry => entry && entry.hook === 'write-pretool-bundle' && entry.event === 'perf_metrics'
      );

    assert.ok(perfLine, 'Expected perf_metrics audit log from hook');
    console.log(`Hook internal duration: ${perfLine.durationMs}ms`);
    assert.ok(
      Number(perfLine.durationMs) < 100,
      `Hook internal logic exceeded budget: ${perfLine.durationMs}ms`
    );
  });
});
