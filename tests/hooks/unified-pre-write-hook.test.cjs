#!/usr/bin/env node
'use strict';

/**
 * Tests for unified-pre-write-hook.cjs
 *
 * Covers two security bugs:
 *   Bug 1: HOOK_FAIL_OPEN=true disables ALL 11 write safety checks
 *   Bug 2: Creator guard regex misses agent subdirectories (core/, domain/, etc.)
 */

const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'unified-pre-write-hook.cjs'
);

// ── Test framework ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    errors.push({ name, message: err.message });
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertNotEqual(actual, notExpected, message) {
  if (actual === notExpected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected value to NOT be ${JSON.stringify(notExpected)}`
    );
  }
}

/**
 * Run the hook process with the given input and env, return { exitCode, stdout, stderr }.
 */
function runHook(inputObj, env = {}) {
  const inputJson = JSON.stringify(inputObj);
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: inputJson,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 5000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Parse the permissionDecision from stdout JSON.
 * Returns 'deny' or 'allow' or null if parse fails.
 */
function parseDecision(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    return parsed.permissionDecision || null;
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeWriteInput(filePath, content = 'test content') {
  return {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content,
    },
  };
}

// ── Bug 2 Tests (Creator Guard Regex) ──────────────────────────────────────
// These test that the creator guard blocks writes to agent subdirectories.
// RED: Before the fix, writes to .claude/agents/core/*.md are NOT blocked.
// GREEN: After the fix, they ARE blocked.

console.log('\n=== Bug 2: Creator Guard Regex — Agent Subdirectories ===\n');

test('creator guard blocks write to .claude/agents/core/*.md', () => {
  const result = runHook(makeWriteInput('.claude/agents/core/test-agent.md', '# Test Agent'), {
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  // Should be blocked (exit code 2) since not in creator workflow
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `Writing to .claude/agents/core/test-agent.md should be denied (got ${JSON.stringify(result.stdout)}, exit: ${result.exitCode})`
  );
});

test('creator guard blocks write to .claude/agents/domain/*.md', () => {
  const result = runHook(makeWriteInput('.claude/agents/domain/analyst.md', '# Domain Agent'), {
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `Writing to .claude/agents/domain/analyst.md should be denied (got ${JSON.stringify(result.stdout)}, exit: ${result.exitCode})`
  );
});

test('creator guard blocks write to .claude/agents/specialized/python-pro.md', () => {
  const result = runHook(
    makeWriteInput('.claude/agents/specialized/python-pro.md', '# Specialized Agent'),
    { CREATOR_GUARD: 'block', CREATOR_WORKFLOW: '' }
  );
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `Writing to .claude/agents/specialized/python-pro.md should be denied (got ${JSON.stringify(result.stdout)}, exit: ${result.exitCode})`
  );
});

test('creator guard blocks write to .claude/agents/orchestrators/master-orchestrator.md', () => {
  const result = runHook(
    makeWriteInput('.claude/agents/orchestrators/master-orchestrator.md', '# Orchestrator'),
    { CREATOR_GUARD: 'block', CREATOR_WORKFLOW: '' }
  );
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `Writing to .claude/agents/orchestrators/master-orchestrator.md should be denied (got ${JSON.stringify(result.stdout)}, exit: ${result.exitCode})`
  );
});

test('creator guard allows write to .claude/agents/ subdirectory when in creator workflow', () => {
  const result = runHook(makeWriteInput('.claude/agents/core/test-agent.md', '# Test Agent'), {
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: 'active',
  });
  // When CREATOR_WORKFLOW is active, it should NOT be denied by creator guard
  // (It may still be blocked by other checks, but not by creator guard specifically)
  // For this test, we set all other guards to 'off'
  const result2 = runHook(makeWriteInput('.claude/agents/core/test-agent.md', '# Test Agent'), {
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: 'active',
    FILE_PLACEMENT_GUARD: 'off',
    ROUTER_WRITE_GUARD: 'off',
    TDD_CHECK: 'off',
    PLAN_EVOLUTION_GUARD: 'off',
    PROJECT_ROOT_WRITE_GUARD: 'off',
    WRITE_CONTENT_SCANNER: 'off',
  });
  // In creator workflow context, creator guard should not block
  const decision = parseDecision(result2.stdout);
  assertNotEqual(
    decision,
    'deny',
    'Write to agent subdirectory should not be denied when CREATOR_WORKFLOW=active'
  );
});

test('creator guard does NOT block write to .claude/lib/utils/foo.cjs', () => {
  const result = runHook(makeWriteInput('.claude/lib/utils/foo.cjs', '// util code'), {
    CREATOR_GUARD: 'block',
    FILE_PLACEMENT_GUARD: 'off',
    ROUTER_WRITE_GUARD: 'off',
    TDD_CHECK: 'off',
    PLAN_EVOLUTION_GUARD: 'off',
    PROJECT_ROOT_WRITE_GUARD: 'off',
    WRITE_CONTENT_SCANNER: 'off',
  });
  // .claude/lib paths should not be blocked by creator guard (only agents/skills/workflows)
  const decision = parseDecision(result.stdout);
  assertNotEqual(
    decision,
    'deny',
    `.claude/lib/utils/foo.cjs should NOT be denied by creator guard (got ${JSON.stringify(result.stdout)})`
  );
});

// ── Bug 1 Tests (HOOK_FAIL_OPEN security bypass) ────────────────────────────
// These test that HOOK_FAIL_OPEN=true does NOT bypass security-critical path checks.
// RED: Before fix, a parse error with HOOK_FAIL_OPEN=true on an agent path exits 0 (allow).
// GREEN: After fix, even with HOOK_FAIL_OPEN=true, security-critical paths are still blocked.

console.log('\n=== Bug 1: HOOK_FAIL_OPEN Security Bypass ===\n');

test('HOOK_FAIL_OPEN=false blocks agent paths on normal input', () => {
  const result = runHook(makeWriteInput('.claude/agents/core/test-agent.md', '# Agent'), {
    HOOK_FAIL_OPEN: 'false',
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  const decision = parseDecision(result.stdout);
  assertEqual(decision, 'deny', `With HOOK_FAIL_OPEN=false, agent path write must be denied`);
});

test('HOOK_FAIL_OPEN=true still blocks security-critical paths (agents)', () => {
  // Even with HOOK_FAIL_OPEN=true, writing to .claude/agents/** should be blocked
  // We test with valid input first - the FAIL_OPEN shouldn't change the outcome for
  // normally-blocked paths (it only affects error recovery, not normal check failures)
  const result = runHook(makeWriteInput('.claude/agents/core/test-agent.md', '# Agent'), {
    HOOK_FAIL_OPEN: 'true',
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `With HOOK_FAIL_OPEN=true, writing to .claude/agents/core/ must still be denied (got ${JSON.stringify(result.stdout)})`
  );
});

test('HOOK_FAIL_OPEN=true still blocks security-critical paths (.claude/hooks/)', () => {
  // Writing to .claude/hooks/ should always be blocked
  const result = runHook(makeWriteInput('.claude/hooks/safety/test.cjs', '// hook'), {
    HOOK_FAIL_OPEN: 'true',
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `With HOOK_FAIL_OPEN=true, writing to .claude/hooks/** must still be denied`
  );
});

test('HOOK_FAIL_OPEN=true still blocks security-critical paths (.claude/agents/ root)', () => {
  const result = runHook(makeWriteInput('.claude/agents/router.md', '# Router'), {
    HOOK_FAIL_OPEN: 'true',
    CREATOR_GUARD: 'block',
    CREATOR_WORKFLOW: '',
  });
  const decision = parseDecision(result.stdout);
  assertEqual(
    decision,
    'deny',
    `With HOOK_FAIL_OPEN=true, writing to .claude/agents/router.md must still be denied`
  );
});

test('HOOK_FAIL_OPEN=true allows non-security paths on normal input', () => {
  // Non-security paths with valid input and guards off should be allowed
  const result = runHook(makeWriteInput('src/utils/helper.js', '// helper'), {
    HOOK_FAIL_OPEN: 'true',
    FILE_PLACEMENT_GUARD: 'off',
    ROUTER_WRITE_GUARD: 'off',
    TDD_CHECK: 'off',
    PLAN_EVOLUTION_GUARD: 'off',
    PROJECT_ROOT_WRITE_GUARD: 'off',
    WRITE_CONTENT_SCANNER: 'off',
    CREATOR_GUARD: 'off',
  });
  // With all guards off, a normal path should be allowed
  const decision = parseDecision(result.stdout);
  // Exit 0 means allow; we also accept if decision is 'allow' or null (passed through)
  const isAllowed = result.exitCode === 0 && decision !== 'deny';
  assertEqual(
    isAllowed,
    true,
    `Non-security path with all guards off and HOOK_FAIL_OPEN=true should be allowed (exit: ${result.exitCode}, decision: ${decision})`
  );
});

// ── Unit tests for CHECKS array (Bug 2 specifically) ───────────────────────

console.log('\n=== Unit Tests: CHECKS array (creator guard check directly) ===\n');

// Load the module for unit testing individual checks
let CHECKS;
try {
  const mod = require(HOOK_PATH);
  CHECKS = mod.CHECKS;
} catch (err) {
  console.log(`  WARN: Could not load CHECKS from hook module: ${err.message}`);
}

if (CHECKS) {
  const creatorGuardCheck = CHECKS.find(c => c.name === 'unified-creator-guard');

  if (creatorGuardCheck) {
    test('creator guard check exists in CHECKS', () => {
      assertEqual(typeof creatorGuardCheck.run, 'function', 'Should have run function');
    });

    test('creator guard check: blocks .claude/agents/core/foo.md (no creator workflow)', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      delete process.env.CREATOR_WORKFLOW;
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/agents/core/foo.md',
        });
        assertEqual(result.pass, false, 'Should block agent subdirectory write (core/)');
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });

    test('creator guard check: blocks .claude/agents/domain/analyst.md (no creator workflow)', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      delete process.env.CREATOR_WORKFLOW;
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/agents/domain/analyst.md',
        });
        assertEqual(result.pass, false, 'Should block agent subdirectory write (domain/)');
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });

    test('creator guard check: blocks .claude/agents/orchestrators/master.md (no creator workflow)', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      delete process.env.CREATOR_WORKFLOW;
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/agents/orchestrators/master.md',
        });
        assertEqual(result.pass, false, 'Should block agent subdirectory write (orchestrators/)');
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });

    test('creator guard check: allows .claude/agents/core/foo.md when in creator workflow', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      process.env.CREATOR_WORKFLOW = 'active';
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/agents/core/foo.md',
        });
        assertEqual(
          result.pass,
          true,
          'Should allow agent subdirectory write when in creator workflow'
        );
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });

    test('creator guard check: does NOT block .claude/lib/utils/foo.cjs', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      delete process.env.CREATOR_WORKFLOW;
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/lib/utils/foo.cjs',
        });
        assertEqual(result.pass, true, 'Should NOT block non-creator paths like .claude/lib/');
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });

    test('creator guard check: still blocks legacy .claude/agents/router.md (root, no subdir)', async () => {
      const origWorkflow = process.env.CREATOR_WORKFLOW;
      const origGuard = process.env.CREATOR_GUARD;
      delete process.env.CREATOR_WORKFLOW;
      process.env.CREATOR_GUARD = 'block';

      try {
        const result = await creatorGuardCheck.run('Write', {
          file_path: '.claude/agents/router.md',
        });
        // The original regex /\.claude\/agents\/[^/]+\.md$/ matches files directly in agents/
        // The fixed regex should also still match these
        assertEqual(result.pass, false, 'Should still block direct .claude/agents/foo.md writes');
      } finally {
        process.env.CREATOR_WORKFLOW = origWorkflow;
        if (origGuard !== undefined) process.env.CREATOR_GUARD = origGuard;
        else delete process.env.CREATOR_GUARD;
      }
    });
  } else {
    console.log('  WARN: unified-creator-guard check not found in CHECKS array');
  }
} else {
  console.log('  WARN: CHECKS not exported from hook module, skipping unit tests');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  console.log('Failed tests:');
  errors.forEach(e => console.log(`  - ${e.name}: ${e.message}`));
  process.exit(1);
} else {
  process.exit(0);
}
