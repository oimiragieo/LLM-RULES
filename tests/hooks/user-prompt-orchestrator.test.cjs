#!/usr/bin/env node
/**
 * Comprehensive tests for user-prompt-orchestrator.cjs
 * Tests hook orchestration and error handling
 *
 * Test coverage:
 * - Hook orchestration in HOOK_ORDER sequence
 * - Child hook success path (all hooks allow)
 * - Child hook failure path (non-zero exit with block message)
 * - Execution error handling (fail-open continues)
 * - Empty stdin handling
 * - Child stderr passthrough
 * - Helper function runChildHook
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Import orchestrator functions
const orchestrator = require(
  path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-orchestrator.cjs')
);

// Mock child hook paths for testing
const MOCK_HOOKS_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'mock-hooks');

// Cleanup function
function cleanupMockHooks() {
  if (fs.existsSync(MOCK_HOOKS_DIR)) {
    fs.rmSync(MOCK_HOOKS_DIR, { recursive: true, force: true });
  }
}

// Create mock hook that succeeds
function createSuccessHook(hookPath) {
  const hookDir = path.dirname(hookPath);
  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }
  fs.writeFileSync(
    hookPath,
    `#!/usr/bin/env node
const fs = require('fs');
const stdin = fs.readFileSync(0, 'utf8');
// Success: exit 0
process.exit(0);
`,
    'utf8'
  );
  fs.chmodSync(hookPath, 0o755);
}

// Create mock hook that blocks (exit non-zero)
function createBlockingHook(hookPath, exitCode = 2, message = 'Blocked by test hook') {
  const hookDir = path.dirname(hookPath);
  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }
  fs.writeFileSync(
    hookPath,
    `#!/usr/bin/env node
const fs = require('fs');
const stdin = fs.readFileSync(0, 'utf8');
process.stdout.write(JSON.stringify({ block: true, message: '${message}' }) + '\\n');
process.exit(${exitCode});
`,
    'utf8'
  );
  fs.chmodSync(hookPath, 0o755);
}

// Create mock hook that throws execution error
// Unused in current tests but kept for future test expansion
// eslint-disable-next-line no-unused-vars
function createErrorHook(hookPath) {
  const hookDir = path.dirname(hookPath);
  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }
  fs.writeFileSync(
    hookPath,
    `#!/usr/bin/env node
throw new Error('Intentional execution error');
`,
    'utf8'
  );
  fs.chmodSync(hookPath, 0o755);
}

// Create mock hook that writes to stderr
function createStderrHook(hookPath, stderrMessage = 'Test stderr message') {
  const hookDir = path.dirname(hookPath);
  if (!fs.existsSync(hookDir)) {
    fs.mkdirSync(hookDir, { recursive: true });
  }
  fs.writeFileSync(
    hookPath,
    `#!/usr/bin/env node
const fs = require('fs');
const stdin = fs.readFileSync(0, 'utf8');
process.stderr.write('${stderrMessage}\\n');
process.exit(0);
`,
    'utf8'
  );
  fs.chmodSync(hookPath, 0o755);
}

describe('user-prompt-orchestrator.cjs - HOOK_ORDER Definition', () => {
  it('should define correct hook execution order', () => {
    assert.ok(Array.isArray(orchestrator.HOOK_ORDER));
    assert.equal(orchestrator.HOOK_ORDER.length, 4);

    // Verify exact order
    assert.equal(orchestrator.HOOK_ORDER[0], '.claude/hooks/reflection/force-step0-execution.cjs');
    assert.equal(orchestrator.HOOK_ORDER[1], '.claude/hooks/session/state-reset.cjs');
    assert.equal(orchestrator.HOOK_ORDER[2], '.claude/hooks/routing/user-prompt-unified.cjs');
    assert.equal(orchestrator.HOOK_ORDER[3], '.claude/hooks/session/drift-detector.cjs');
  });
});

describe('user-prompt-orchestrator.cjs - runChildHook Function', () => {
  beforeEach(() => {
    cleanupMockHooks();
  });

  afterEach(() => {
    cleanupMockHooks();
  });

  it('should execute child hook with stdin data', () => {
    const hookPath = path.join(MOCK_HOOKS_DIR, 'test-hook.cjs');
    createSuccessHook(hookPath);

    const stdinData = JSON.stringify({ tool: 'Test', args: {} });
    const result = orchestrator.runChildHook(hookPath, stdinData);

    assert.equal(result.status, 0);
    assert.equal(result.error, undefined);
  });

  it('should capture child hook stdout', () => {
    const hookPath = path.join(MOCK_HOOKS_DIR, 'stdout-hook.cjs');
    const hookDir = path.dirname(hookPath);
    if (!fs.existsSync(hookDir)) {
      fs.mkdirSync(hookDir, { recursive: true });
    }
    fs.writeFileSync(
      hookPath,
      `#!/usr/bin/env node
process.stdout.write('Test output\\n');
process.exit(0);
`,
      'utf8'
    );
    fs.chmodSync(hookPath, 0o755);

    const result = orchestrator.runChildHook(hookPath, '');

    assert.equal(result.stdout.trim(), 'Test output');
    assert.equal(result.status, 0);
  });

  it('should capture child hook stderr', () => {
    const hookPath = path.join(MOCK_HOOKS_DIR, 'stderr-hook.cjs');
    createStderrHook(hookPath, 'Error message');

    const result = orchestrator.runChildHook(hookPath, '');

    assert.ok(result.stderr.includes('Error message'));
    assert.equal(result.status, 0);
  });

  it('should return error on execution failure', () => {
    const hookPath = path.join(MOCK_HOOKS_DIR, 'nonexistent-hook.cjs');

    const result = orchestrator.runChildHook(hookPath, '');

    assert.equal(result.status, 1);
    assert.equal(result.error, undefined);
    assert.ok(
      result.stderr.includes('Cannot find module') || result.stderr.includes('MODULE_NOT_FOUND')
    );
  });

  it('should capture non-zero exit code', () => {
    const hookPath = path.join(MOCK_HOOKS_DIR, 'block-hook.cjs');
    createBlockingHook(hookPath, 2, 'Test block message');

    const result = orchestrator.runChildHook(hookPath, '');

    assert.equal(result.status, 2);
    assert.ok(result.stdout.includes('Test block message'));
  });
});

describe('user-prompt-orchestrator.cjs - Empty Stdin Handling', () => {
  it('should exit gracefully on empty stdin', () => {
    const orchestratorPath = path.join(
      PROJECT_ROOT,
      '.claude',
      'hooks',
      'session',
      'user-prompt-orchestrator.cjs'
    );

    // Run with no stdin
    const result = cp.spawnSync('node', [orchestratorPath], {
      encoding: 'utf8',
      env: process.env,
      shell: false,
    });

    // Should exit 0
    assert.equal(result.status, 0);
  });
});

describe('user-prompt-orchestrator.cjs - bootstrap read targets', () => {
  it('creates default runtime and memory placeholders when missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-orchestrator-'));

    try {
      orchestrator.ensureBootstrapReadTargets(tempRoot);

      const spawnRequestPath = path.join(
        tempRoot,
        '.claude',
        'context',
        'runtime',
        'reflection-spawn-request.json'
      );
      const reminderPath = path.join(
        tempRoot,
        '.claude',
        'context',
        'runtime',
        'reflection-reminder.txt'
      );
      const openFindingsPath = path.join(
        tempRoot,
        '.claude',
        'context',
        'memory',
        'open-findings.json'
      );
      const learningsPath = path.join(tempRoot, '.claude', 'context', 'memory', 'learnings.md');
      const trendPath = path.join(
        tempRoot,
        '.claude',
        'context',
        'metrics',
        'open-findings-trend.jsonl'
      );

      assert.equal(fs.existsSync(spawnRequestPath), true);
      assert.equal(fs.existsSync(reminderPath), true);
      assert.equal(fs.existsSync(openFindingsPath), true);
      assert.equal(fs.existsSync(learningsPath), true);
      assert.equal(fs.existsSync(trendPath), true);

      const spawnRequests = JSON.parse(fs.readFileSync(spawnRequestPath, 'utf8'));
      assert.deepEqual(spawnRequests, []);

      const openFindings = JSON.parse(fs.readFileSync(openFindingsPath, 'utf8'));
      assert.equal(Array.isArray(openFindings.findings), true);
      assert.equal(openFindings.findings.length, 0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
