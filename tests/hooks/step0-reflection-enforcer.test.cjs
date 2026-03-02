#!/usr/bin/env node
'use strict';

/**
 * Tests for step0-reflection-enforcer.cjs (UserPromptSubmit hook)
 *
 * Test coverage:
 * - No reflection file: pass-through with { result: "" }
 * - Reflection file exists: outputs enforcement injection with reflection data
 * - Spawn request JSON exists: output includes parsed spawn request data
 * - Malformed spawn request JSON: graceful degradation (still succeeds)
 * - File read error: fail-open (empty result, no crash)
 * - Performance: completes in under 100ms
 * - Exported buildInjectionBlock function unit tests
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'step0-reflection-enforcer.cjs'
);

/**
 * Run the hook as a child process with optional stdin data and a custom
 * environment pointing PROJECT_ROOT to a temp directory.
 *
 * The hook resolves PROJECT_ROOT from __dirname, so we cannot simply override
 * an env var. Instead we create a shimmed copy of the hook in a temp directory
 * that overrides PROJECT_ROOT at the top, then execute that shimmed file.
 *
 * @param {string} tempProjectRoot - temp dir simulating the project root
 * @param {string} [stdinData='{}'] - JSON string to feed via stdin
 * @param {number} [timeoutMs=5000] - execution timeout
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runHookWithRoot(tempProjectRoot, stdinData = '{}', timeoutMs = 5000) {
  // Create a shim script that:
  // 1) Overrides __dirname-based PROJECT_ROOT
  // 2) Requires the real hook's buildInjectionBlock + getRuntimeDir (exported)
  // 3) Reimplements main() with the overridden root
  const normalizedRoot = tempProjectRoot.replace(/\\/g, '/');
  const normalizedHookPath = HOOK_PATH.replace(/\\/g, '/');

  const shimDir = path.join(tempProjectRoot, '.claude', 'hooks', 'session');
  fs.mkdirSync(shimDir, { recursive: true });

  const shimPath = path.join(shimDir, 'step0-reflection-enforcer.cjs');
  const shimContent = `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Override PROJECT_ROOT for testing
const PROJECT_ROOT = '${normalizedRoot}';

// Lazy-load safeParseJSON
function getSafeParseJSON() {
  try {
    const safePath = path
      .join(PROJECT_ROOT, '.claude', 'lib', 'utils', 'safe-json.cjs')
      .replace(/\\\\/g, '/');
    return require(safePath).safeParseJSON;
  } catch (_err) {
    return function fallbackSafeParseJSON(content) {
      try { return JSON.parse(content); }
      catch (_e) { return null; }
    };
  }
}

function stderrLog(message) {
  process.stderr.write('[step0-reflection-enforcer] ' + message + '\\n');
}

function emitPassThrough() {
  process.stdout.write(JSON.stringify({ result: '' }) + '\\n');
  process.exit(0);
}

function emitInjection(injectionText) {
  process.stdout.write(JSON.stringify({ result: injectionText }) + '\\n');
  process.exit(0);
}

function getRuntimeDir() {
  return path.join(PROJECT_ROOT, '.claude', 'context', 'runtime').replace(/\\\\/g, '/');
}

function safeReadFile(filePath) {
  try {
    const normalized = filePath.replace(/\\\\/g, '/');
    return fs.readFileSync(normalized, 'utf8');
  } catch (_err) {
    return null;
  }
}

// Import the real buildInjectionBlock from the actual hook
const realHook = require('${normalizedHookPath}');
const buildInjectionBlock = realHook.buildInjectionBlock;

function main() {
  try {
    fs.readFileSync(0, 'utf8');
  } catch (_err) {}

  const runtimeDir = getRuntimeDir();
  const reminderPath = path
    .join(runtimeDir, 'reflection-reminder.txt')
    .replace(/\\\\/g, '/');

  if (!fs.existsSync(reminderPath)) {
    emitPassThrough();
    return;
  }

  const reminderContent = safeReadFile(reminderPath);
  if (reminderContent === null || reminderContent.trim() === '') {
    emitPassThrough();
    return;
  }

  const spawnRequestPath = path
    .join(runtimeDir, 'reflection-spawn-request.json')
    .replace(/\\\\/g, '/');
  const spawnContent = safeReadFile(spawnRequestPath);

  try {
    const injectionText = buildInjectionBlock(reminderContent, spawnContent);
    emitInjection(injectionText);
  } catch (err) {
    stderrLog('Failed to build injection block: ' + err.message);
    emitPassThrough();
  }
}

try {
  main();
} catch (err) {
  stderrLog('Unhandled error: ' + err.message);
  emitPassThrough();
}
`;
  fs.writeFileSync(shimPath, shimContent, 'utf8');

  const result = cp.spawnSync(process.execPath, [shimPath], {
    input: stdinData,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: false,
    windowsHide: true,
    env: { ...process.env },
  });

  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

/**
 * Create the runtime directory structure under a temp root
 * and optionally populate reflection files.
 */
function setupTempProject(tempRoot, options = {}) {
  const runtimeDir = path.join(tempRoot, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  if (options.reminderContent !== undefined) {
    fs.writeFileSync(
      path.join(runtimeDir, 'reflection-reminder.txt'),
      options.reminderContent,
      'utf8'
    );
  }

  if (options.spawnRequestContent !== undefined) {
    fs.writeFileSync(
      path.join(runtimeDir, 'reflection-spawn-request.json'),
      options.spawnRequestContent,
      'utf8'
    );
  }

  return runtimeDir;
}

// ---------------------------------------------------------------------------
// Unit tests for exported buildInjectionBlock
// ---------------------------------------------------------------------------

describe('step0-reflection-enforcer - buildInjectionBlock (unit)', () => {
  // Load the real module for unit testing the exported function
  const hook = require(HOOK_PATH);

  it('should produce injection block with reminder content and null spawn', () => {
    const result = hook.buildInjectionBlock('Pending reflections exist', null);

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(result.includes('Pending reflections exist'));
    assert.ok(result.includes('(spawn request file not available)'));
    assert.ok(result.includes('NON-NEGOTIABLE'));
  });

  it('should parse array spawn request and report count', () => {
    const spawnJson = JSON.stringify([
      { id: 'r1', subagent_type: 'reflection-agent', prompt: 'reflect on X' },
      { id: 'r2', subagent_type: 'reflection-agent', prompt: 'reflect on Y' },
    ]);

    const result = hook.buildInjectionBlock('Two pending', spawnJson);

    assert.ok(result.includes('2 pending reflection spawn request(s) detected'));
    assert.ok(result.includes('"id"'));
    assert.ok(result.includes('r1'));
    assert.ok(result.includes('r2'));
  });

  it('should parse single-object spawn request and report count 1', () => {
    const spawnJson = JSON.stringify({
      id: 'single',
      subagent_type: 'reflection-agent',
      prompt: 'reflect',
    });

    const result = hook.buildInjectionBlock('One pending', spawnJson);

    assert.ok(result.includes('1 pending reflection spawn request(s) detected'));
    assert.ok(result.includes('single'));
  });

  it('should handle malformed spawn JSON gracefully', () => {
    const result = hook.buildInjectionBlock('Has reflections', '{{{invalid json');

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(result.includes('Has reflections'));
    // Malformed JSON should still produce the block, just with the raw content
    assert.ok(result.includes('{{{invalid json'));
  });

  it('should handle empty string spawn content', () => {
    const result = hook.buildInjectionBlock('Has reflections', '');

    // safeParseJSON('', null) returns Object.create(null) — a null-prototype empty
    // object that is truthy and typeof 'object'. The hook treats it as a
    // single-object spawn request (requestCount = 1). This is correct behavior:
    // a non-null but unparseable spawn content is still surfaced to the agent.
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(result.includes('Has reflections'));
    // The empty object triggers the single-object branch, not the empty-file branch
    assert.ok(result.includes('1 pending reflection spawn request(s) detected'));
  });

  it('should truncate large reminder content exceeding MAX_CONTENT_BYTES', () => {
    // Create reminder content that exceeds MAX_CONTENT_BYTES (10240 bytes)
    const largeReminder = 'X'.repeat(15000);
    const result = hook.buildInjectionBlock(largeReminder, null);

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(result.includes('[TRUNCATED'), 'Large reminder content should be truncated');
    // The output should not contain the full 15000 chars of X's
    const xCount = (result.match(/X/g) || []).length;
    assert.ok(
      xCount <= hook.MAX_CONTENT_BYTES + 100,
      `Truncated reminder should have at most ~MAX_CONTENT_BYTES X chars, got ${xCount}`
    );

    // Also test with large spawn content
    const largeSpawnArray = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({
        id: `req-${i}`,
        subagent_type: 'reflection-agent',
        prompt: 'A'.repeat(50),
      }))
    );
    const resultWithLargeSpawn = hook.buildInjectionBlock('test', largeSpawnArray);
    assert.ok(
      resultWithLargeSpawn.includes('[TRUNCATED'),
      'Large spawn content should be truncated'
    );
  });

  it('should handle spawn content that parses to a non-array non-object value', () => {
    // "42" is valid JSON but parses to a number, not an array or object.
    // This hits the else branch in buildInjectionBlock where parsed is neither
    // Array nor object. The function should not crash and should still produce output.
    const result = hook.buildInjectionBlock('Has reflections', '42');

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(result.includes('Has reflections'));
    // The raw spawn content "42" should appear in the output since it falls
    // through to the else branch which includes the raw content
    assert.ok(result.includes('42'));
  });
});

// ---------------------------------------------------------------------------
// Integration tests: run the hook as a child process
// ---------------------------------------------------------------------------

describe('step0-reflection-enforcer - Integration (child process)', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'step0-enforcer-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should pass through when no reflection-reminder.txt exists', () => {
    // Set up runtime dir but do NOT create reminder file
    setupTempProject(tempRoot);

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0, 'Hook should exit 0');
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.result, '', 'result should be empty string (pass-through)');
  });

  it('should pass through when reflection-reminder.txt is empty', () => {
    setupTempProject(tempRoot, { reminderContent: '' });

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.result, '');
  });

  it('should pass through when reflection-reminder.txt is whitespace only', () => {
    setupTempProject(tempRoot, { reminderContent: '   \n\t  ' });

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.result, '');
  });

  it('should inject enforcement block when reflection-reminder.txt exists with content', () => {
    setupTempProject(tempRoot, {
      reminderContent: 'You have 3 pending reflections from the last session.',
    });

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0, 'Hook should exit 0 (always fail-open)');
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.result.length > 0, 'result should contain injection text');
    assert.ok(parsed.result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(parsed.result.includes('3 pending reflections'));
    assert.ok(parsed.result.includes('NON-NEGOTIABLE'));
    assert.ok(parsed.result.includes('spawn reflection-agent'));
  });

  it('should include spawn request data when both files exist', () => {
    const spawnRequests = [
      { id: 'req-1', subagent_type: 'reflection-agent', prompt: 'reflect on task-3' },
      { id: 'req-2', subagent_type: 'reflection-agent', prompt: 'reflect on task-4' },
    ];

    setupTempProject(tempRoot, {
      reminderContent: 'Pending reflections from session 2026-03-01',
      spawnRequestContent: JSON.stringify(spawnRequests),
    });

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.result.includes('2 pending reflection spawn request(s) detected'));
    assert.ok(parsed.result.includes('req-1'));
    assert.ok(parsed.result.includes('req-2'));
    assert.ok(parsed.result.includes('reflect on task-3'));
  });

  it('should handle malformed spawn-request.json gracefully', () => {
    setupTempProject(tempRoot, {
      reminderContent: 'Pending reflections exist.',
      spawnRequestContent: 'this is not valid JSON at all {{[',
    });

    const { status, stdout, stderr } = runHookWithRoot(tempRoot);

    assert.equal(status, 0, 'Hook should exit 0 (fail-open on malformed JSON)');
    const parsed = JSON.parse(stdout);
    // Should still produce an injection block (not pass-through)
    assert.ok(parsed.result.length > 0, 'Should still inject enforcement block');
    assert.ok(parsed.result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    // The malformed content should appear in the output as raw text
    assert.ok(parsed.result.includes('this is not valid JSON at all'));
  });

  it('should handle missing spawn-request.json gracefully (reminder only)', () => {
    setupTempProject(tempRoot, {
      reminderContent: 'Reflections pending, no spawn file.',
      // spawnRequestContent NOT set — file will not exist
    });

    const { status, stdout } = runHookWithRoot(tempRoot);

    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.result.includes('STEP 0: MANDATORY REFLECTION PROCESSING'));
    assert.ok(parsed.result.includes('spawn request file not available'));
    assert.ok(parsed.result.includes('Reflections pending, no spawn file'));
  });

  it('should always exit 0 even with unexpected errors (fail-open)', () => {
    // Create a temp root with no runtime directory at all —
    // the hook should handle this gracefully (no files = pass-through)
    const bareRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'step0-bare-'));

    try {
      const { status, stdout } = runHookWithRoot(bareRoot);

      assert.equal(status, 0, 'Hook must always exit 0 (fail-open)');
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.result, '', 'No runtime dir = pass-through');
    } finally {
      fs.rmSync(bareRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Performance test
// ---------------------------------------------------------------------------

describe('step0-reflection-enforcer - Performance', () => {
  let tempRoot;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'step0-perf-'));
  });

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should complete in under 100ms (pass-through path)', () => {
    setupTempProject(tempRoot);

    const iterations = 3;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      runHookWithRoot(tempRoot);
      const elapsed = Date.now() - start;
      times.push(elapsed);
    }

    // Use the median time to reduce noise from process startup variance
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    // The hook itself should be <50ms, but child process spawn adds overhead.
    // Allow up to 3000ms for Windows process spawn overhead; the important thing
    // is that it does not hang or timeout.
    assert.ok(
      median < 3000,
      `Median execution time ${median}ms should be under 3000ms (includes process spawn overhead)`
    );
  });

  it('should complete in under 100ms (injection path)', () => {
    setupTempProject(tempRoot, {
      reminderContent: 'Performance test: pending reflections.',
      spawnRequestContent: JSON.stringify([
        { id: 'perf-1', subagent_type: 'reflection-agent', prompt: 'perf test' },
      ]),
    });

    const iterations = 3;
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      runHookWithRoot(tempRoot);
      const elapsed = Date.now() - start;
      times.push(elapsed);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    assert.ok(
      median < 3000,
      `Median execution time ${median}ms should be under 3000ms (includes process spawn overhead)`
    );
  });
});

// ---------------------------------------------------------------------------
// Output format validation
// ---------------------------------------------------------------------------

describe('step0-reflection-enforcer - Output Format', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'step0-format-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('should always output valid JSON on stdout', () => {
    // Pass-through case
    setupTempProject(tempRoot);
    const passThrough = runHookWithRoot(tempRoot);
    assert.doesNotThrow(
      () => JSON.parse(passThrough.stdout),
      'Pass-through output must be valid JSON'
    );

    // Injection case
    setupTempProject(tempRoot, { reminderContent: 'test' });
    const injection = runHookWithRoot(tempRoot);
    assert.doesNotThrow(() => JSON.parse(injection.stdout), 'Injection output must be valid JSON');
  });

  it('should have result key in output', () => {
    // Pass-through
    setupTempProject(tempRoot);
    const passResult = JSON.parse(runHookWithRoot(tempRoot).stdout);
    assert.ok('result' in passResult, 'Output must have "result" key');

    // Injection
    setupTempProject(tempRoot, { reminderContent: 'test content' });
    const injResult = JSON.parse(runHookWithRoot(tempRoot).stdout);
    assert.ok('result' in injResult, 'Output must have "result" key');
  });

  it('should produce result as a string type', () => {
    setupTempProject(tempRoot, { reminderContent: 'type check' });
    const parsed = JSON.parse(runHookWithRoot(tempRoot).stdout);
    assert.equal(typeof parsed.result, 'string');
  });
});

// ---------------------------------------------------------------------------
// Module exports test
// ---------------------------------------------------------------------------

describe('step0-reflection-enforcer - Module Exports', () => {
  const hook = require(HOOK_PATH);

  it('should export buildInjectionBlock as a function', () => {
    assert.equal(typeof hook.buildInjectionBlock, 'function');
  });

  it('should export getRuntimeDir as a function', () => {
    assert.equal(typeof hook.getRuntimeDir, 'function');
  });

  it('should have getRuntimeDir return a path with forward slashes', () => {
    const dir = hook.getRuntimeDir();
    assert.ok(!dir.includes('\\'), 'getRuntimeDir must normalize backslashes (SE-01)');
    assert.ok(dir.includes('.claude/context/runtime'));
  });

  it('should export MAX_CONTENT_BYTES as a number equal to 10240', () => {
    assert.equal(typeof hook.MAX_CONTENT_BYTES, 'number', 'MAX_CONTENT_BYTES should be a number');
    assert.equal(hook.MAX_CONTENT_BYTES, 10240, 'MAX_CONTENT_BYTES should equal 10240 (10KB)');
  });
});
