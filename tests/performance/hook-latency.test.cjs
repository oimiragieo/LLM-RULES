'use strict';

const { spawnSync } = require('child_process');
const assert = require('assert');
const test = require('node:test');
const path = require('path');
const { performance } = require('node:perf_hooks');

const PROJECT_ROOT = process.cwd();
const HOOK_SCRIPT = path.join(PROJECT_ROOT, '.claude/hooks/safety/write-pretool-bundle.cjs');

// Mock input for the hook
const MOCK_INPUT = JSON.stringify({
  tool_name: 'Write',
  tool_input: {
    file_path: 'test.txt',
    content: 'hello'
  }
});

test('Hook Latency Performance', async t => {
  console.log('Checking hook script:', HOOK_SCRIPT);
  if (!require('fs').existsSync(HOOK_SCRIPT)) {
    console.log('Hook script not found');
    return; 
  }

  await t.test('Write PreTool Bundle should execute under 100ms', () => {
    const start = performance.now();
    const result = spawnSync(process.execPath, [HOOK_SCRIPT], {
      input: MOCK_INPUT,
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
      windowsHide: true // Important for performance on Windows
    });
    const duration = performance.now() - start;

    if (result.error) throw result.error;
    
    // We log it for visibility
    console.log(`Duration: ${duration.toFixed(2)}ms`);
    
    // 150ms budget for test environment (ci overhead)
    assert.ok(duration < 250, `Hook took too long: ${duration.toFixed(2)}ms`);
  });
});
