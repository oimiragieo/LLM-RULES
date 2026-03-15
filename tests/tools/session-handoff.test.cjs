'use strict';

/**
 * TDD RED Phase: Tests for session-handoff.cjs (send side)
 *
 * Tests the enhanced handoff log format with structured JSON
 * resumeInstructions, token count validation, and --name flag.
 *
 * All NEW tests should FAIL until implementation changes are made.
 * The existing broken import test is removed (wrong path).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const HANDOFF_SCRIPT = path.join(
  process.cwd(),
  '.claude/skills/session-handoff/session-handoff.cjs'
);

/**
 * Create a minimal project layout that session-handoff.cjs expects:
 * - .claude/context/runtime/ (for budget-tracker.json, tasks.json, session-id.json)
 * - .claude/context/memory/ (for active_context.md)
 * - scripts/spawn-new-session.cjs (mock)
 */
function setupProject(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-project-'));
  const runtimeDir = path.join(tmpDir, '.claude', 'context', 'runtime');
  const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  const scriptsDir = path.join(tmpDir, 'scripts');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  // Create mock spawn-new-session.cjs that just exits 0
  fs.writeFileSync(
    path.join(scriptsDir, 'spawn-new-session.cjs'),
    '#!/usr/bin/env node\nprocess.exit(0);',
    'utf8'
  );

  // Write tasks.json
  if (opts.tasks) {
    fs.writeFileSync(path.join(runtimeDir, 'tasks.json'), JSON.stringify(opts.tasks), 'utf8');
  }

  // Write budget-tracker.json
  if (opts.budgetTracker) {
    fs.writeFileSync(
      path.join(runtimeDir, 'budget-tracker.json'),
      JSON.stringify(opts.budgetTracker),
      'utf8'
    );
  }

  // Write session-id.json
  if (opts.sessionId) {
    fs.writeFileSync(
      path.join(runtimeDir, 'session-id.json'),
      JSON.stringify({ sessionId: opts.sessionId }),
      'utf8'
    );
  }

  // Write active_context.md
  if (opts.activeContext) {
    fs.writeFileSync(path.join(memoryDir, 'active_context.md'), opts.activeContext, 'utf8');
  }

  return { tmpDir, runtimeDir, memoryDir, scriptsDir };
}

function cleanupProject(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function readHandoffLog(runtimeDir) {
  const logPath = path.join(runtimeDir, 'shift-change-log.json');
  if (!fs.existsSync(logPath)) return null;
  return JSON.parse(fs.readFileSync(logPath, 'utf8'));
}

// --- Test 1: Handoff produces structured JSON log (not hardcoded string) ---
test('session-handoff > produces structured JSON resumeInstructions (not hardcoded string)', () => {
  const { tmpDir, runtimeDir } = setupProject({
    activeContext: '# Current objective\nImplementing session handoff overhaul',
    sessionId: 'test-session-1',
    budgetTracker: { 'test-session-1': { totalTokens: 150000, budget: 200000 } },
  });

  try {
    // Run the handoff script with --auto-suspend to bypass task gate
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should be written');

    // resumeInstructions must be an object, not a string
    assert.strictEqual(
      typeof log.resumeInstructions,
      'object',
      'resumeInstructions must be a structured JSON object, not a string'
    );
    assert.notStrictEqual(
      log.resumeInstructions,
      'Resume previous objective.',
      'resumeInstructions must not be the hardcoded default'
    );
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 2: JSON log contains required structured fields ---
test('session-handoff > JSON log contains all required structured fields', () => {
  const { tmpDir, runtimeDir } = setupProject({
    activeContext: '# Implementing auth\nWorking on JWT tokens',
    sessionId: 'test-session-2',
    budgetTracker: { 'test-session-2': { totalTokens: 100000, budget: 200000 } },
    tasks: [
      { id: 'task-1', description: 'Fix auth', status: 'completed' },
      { id: 'task-2', description: 'Add tests', status: 'in_progress' },
    ],
  });

  try {
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should be written');

    const ri = log.resumeInstructions;
    assert.ok(ri, 'resumeInstructions must exist');

    // All required fields per council review
    assert.ok('objective' in ri, 'Must have objective field');
    assert.ok('nextStep' in ri, 'Must have nextStep field');
    assert.ok(Array.isArray(ri.openTasks), 'Must have openTasks array');
    assert.ok(Array.isArray(ri.keyFiles), 'Must have keyFiles array');
    assert.ok(Array.isArray(ri.recentDecisions), 'Must have recentDecisions array');
    assert.ok(Array.isArray(ri.risks), 'Must have risks array');
    assert.ok('resumePrompt' in ri, 'Must have resumePrompt field');
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 3: --name flag is included in spawn command ---
test('session-handoff > --name shift-YYYY-MM-DD-HH flag included in spawn command', () => {
  // This test verifies the spawn script is called with --name flag
  // We check the handoff log for a sessionName field or verify the spawn args
  const { tmpDir, runtimeDir, scriptsDir } = setupProject({
    activeContext: '# Test objective',
    sessionId: 'test-session-3',
  });

  // Replace mock spawn script with one that logs its args
  fs.writeFileSync(
    path.join(scriptsDir, 'spawn-new-session.cjs'),
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const argsFile = path.join(process.cwd(), '.claude/context/runtime/spawn-args.json');
fs.writeFileSync(argsFile, JSON.stringify(process.argv.slice(2)));
process.exit(0);`,
    'utf8'
  );

  try {
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const argsPath = path.join(runtimeDir, 'spawn-args.json');
    assert.ok(fs.existsSync(argsPath), 'Spawn script should have been called');
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    const nameArg = args.find(a => a.startsWith('--name'));
    assert.ok(nameArg || args.includes('--name'), 'Spawn command should include --name flag');

    // Verify the name format is shift-YYYY-MM-DD-HH
    const nameIdx = args.indexOf('--name');
    if (nameIdx >= 0) {
      const nameVal = args[nameIdx + 1];
      assert.ok(
        /^shift-\d{4}-\d{2}-\d{2}-\d{2}$/.test(nameVal),
        `Name should match shift-YYYY-MM-DD-HH format, got: ${nameVal}`
      );
    }
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 4: countTokens() validation runs before handoff document write ---
test('session-handoff > validates token count from budget-tracker before writing handoff', () => {
  const { tmpDir, runtimeDir } = setupProject({
    activeContext: '# Test',
    sessionId: 'test-session-4',
    budgetTracker: { 'test-session-4': { totalTokens: 150000, budget: 200000 } },
  });

  try {
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should be written');
    assert.ok(
      typeof log.tokenCount === 'number',
      'Handoff log must include numeric tokenCount from budget-tracker'
    );
    assert.strictEqual(
      log.tokenCount,
      150000,
      'tokenCount should match the value from budget-tracker.json'
    );
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 5: Handoff fails gracefully if budget-tracker.json reports 0 tokens ---
test('session-handoff > handles 0 tokens in budget-tracker gracefully', () => {
  const { tmpDir, runtimeDir } = setupProject({
    activeContext: '# Test',
    sessionId: 'test-session-5',
    budgetTracker: { 'test-session-5': { totalTokens: 0, budget: 200000 } },
  });

  try {
    // Should not throw even with 0 tokens
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should still be written even with 0 tokens');
    assert.strictEqual(log.tokenCount, 0, 'tokenCount should be 0');
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 6: Schema version 2.0.0 for structured format ---
test('session-handoff > uses schemaVersion 2.0.0 for structured handoff format', () => {
  const { tmpDir, runtimeDir } = setupProject({
    activeContext: '# Test',
    sessionId: 'test-session-6',
  });

  try {
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should be written');
    assert.strictEqual(
      log.schemaVersion,
      '2.0.0',
      'Schema version should be 2.0.0 for new structured format'
    );
  } finally {
    cleanupProject(tmpDir);
  }
});

// --- Test 7: Handoff includes pendingMemoryWrites from recent learnings ---
test('session-handoff > includes pendingMemoryWrites from recent learnings', () => {
  const { tmpDir, runtimeDir, memoryDir } = setupProject({
    activeContext: '# Test',
    sessionId: 'test-session-7',
  });

  // Write some learnings
  fs.writeFileSync(
    path.join(memoryDir, 'learnings.md'),
    `# Learnings

## Recent
- Learning 1: JWT refresh tokens need httpOnly cookies
- Learning 2: Use safeParseJSON for untrusted input
- Learning 3: Windows paths need normalization
`,
    'utf8'
  );

  try {
    execFileSync('node', [HANDOFF_SCRIPT, '--auto-suspend'], {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });

    const log = readHandoffLog(runtimeDir);
    assert.ok(log, 'Handoff log should be written');
    assert.ok(
      Array.isArray(log.pendingMemoryWrites),
      'Handoff log must include pendingMemoryWrites array'
    );
    assert.ok(
      log.pendingMemoryWrites.length > 0,
      'pendingMemoryWrites should contain entries from learnings.md'
    );
  } finally {
    cleanupProject(tmpDir);
  }
});
