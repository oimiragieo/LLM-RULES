// @ts-check
/**
 * Tests for Metrics Collector Hook Wrapper
 *
 * Tests the hook wrapper that invokes the metrics-collector library.
 * The wrapper must read hook input from stdin (not argv) and pass it to the library.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(
  process.cwd(),
  '.claude',
  'hooks',
  'monitoring',
  'metrics-collector-hook.cjs'
);

const METRICS_FILE = path.join(
  process.cwd(),
  '.claude',
  'context',
  'metrics',
  'hook-metrics.jsonl'
);

/**
 * Helper to run the hook with stdin input
 * @param {Object} hookInput - Hook input to send via stdin
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>}
 */
function runHookWithStdin(hookInput) {
  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', err => {
      resolve({ code: null, stdout, stderr: err.message });
    });

    // Send input via stdin (this is how Claude Code sends hook input)
    proc.stdin.write(JSON.stringify(hookInput));
    proc.stdin.end();
  });
}

/**
 * Find a metric entry by tool name in the metrics file
 * @param {string} toolName - Tool name to search for
 * @returns {Object|null}
 */
function findMetricByTool(toolName) {
  if (!fs.existsSync(METRICS_FILE)) {
    return null;
  }
  const content = fs.readFileSync(METRICS_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);

  // Search from end to find most recent match
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const metric = JSON.parse(lines[i]);
      if (metric.tool === toolName) {
        return metric;
      }
    } catch (_e) {
      // Skip invalid lines
    }
  }
  return null;
}

/**
 * Get the last metric entry from the metrics file (unused but kept for debugging)
 * @returns {Object|null}
 */
function _getLastMetric() {
  if (!fs.existsSync(METRICS_FILE)) {
    return null;
  }
  const content = fs.readFileSync(METRICS_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch (_e) {
    return null;
  }
}

test('metrics-collector-hook: reads hook input from stdin', async () => {
  // Use unique tool name to avoid interference from other tests
  const uniqueToolName = `TestTool_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Prepare hook input (simulating PostToolUse event from Claude Code)
  const hookInput = {
    tool_name: uniqueToolName,
    tool_input: { test: 'value' },
    tool_output: { result: 'success' },
    session_id: 'test-session-123',
  };

  // Run hook with stdin input
  const { code } = await runHookWithStdin(hookInput);

  // Hook should exit cleanly
  assert.strictEqual(code, 0, 'Hook should exit with code 0');

  // CRITICAL: Verify the specific metric was written
  // This is the core test - if stdin reading works, a metric should be logged
  const metric = findMetricByTool(uniqueToolName);
  assert.ok(
    metric,
    `Expected to find metric for tool '${uniqueToolName}'. ` +
      'This means the hook is not reading stdin input correctly.'
  );

  // Verify the metric content
  assert.strictEqual(metric.tool, uniqueToolName, 'Metric should have correct tool name');
  assert.strictEqual(metric.status, 'success', 'Metric should have success status');
  assert.strictEqual(metric.event, 'PostToolUse', 'Metric should be PostToolUse event');
});

test('metrics-collector-hook: handles tool with error result', async () => {
  // Use unique tool name
  const uniqueToolName = `FailingTool_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const hookInput = {
    tool_name: uniqueToolName,
    tool_input: { param: 'value' },
    tool_output: { error: { message: 'Something went wrong' } },
    session_id: 'test-session-456',
  };

  const { code } = await runHookWithStdin(hookInput);
  assert.strictEqual(code, 0, 'Hook should exit with code 0 even on tool error');

  const metric = findMetricByTool(uniqueToolName);
  assert.ok(metric, 'Should log metric even for failed tools');
  assert.strictEqual(metric.tool, uniqueToolName);
  assert.strictEqual(metric.status, 'failure');
});

test('metrics-collector-hook: exits cleanly with no input', async () => {
  // Run hook with no stdin input (empty)
  const { code } = await new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.on('close', code => {
      resolve({ code });
    });

    // Close stdin immediately without sending data
    proc.stdin.end();
  });

  // Hook should exit cleanly (not crash)
  assert.strictEqual(code, 0, 'Hook should exit with code 0 on empty input');
});

test('metrics-collector-hook: handles invalid JSON gracefully', async () => {
  const { code } = await new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.on('close', code => {
      resolve({ code });
    });

    // Send invalid JSON
    proc.stdin.write('not valid json{{{');
    proc.stdin.end();
  });

  // Hook should exit cleanly (not crash)
  assert.strictEqual(code, 0, 'Hook should handle invalid JSON gracefully');
});
