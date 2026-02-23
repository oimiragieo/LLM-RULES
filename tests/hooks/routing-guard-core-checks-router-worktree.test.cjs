'use strict';

/**
 * D1-test (RED): Worktree bypass gap in routing-guard-core.checks-router.cjs
 *
 * Root cause: checkRouterBash and checkRouterSelfCheck call
 *   hasExplicitAgentContext(hookInput)
 * without forwarding a cwd override. So the worktree bypass (Fix 2) never fires
 * in these functions — even when an agent runs inside a worktree.
 *
 * Fix (D2-impl): add optional cwd = process.cwd() to both functions and forward it:
 *   hasExplicitAgentContext(hookInput, cwd)
 *
 * RED state: tests below FAIL on current code because cwd is ignored.
 * GREEN state: tests pass after D2-impl adds the cwd parameter.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('checks-router — worktree bypass gap (D1 RED)', () => {
  let checkRouterBash;
  let checkRouterSelfCheck;
  let savedEnv;
  let tmpDir;

  beforeEach(() => {
    savedEnv = { ...process.env };

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rgc-checks-router-wt-'));
    const stateFile = path.join(tmpDir, 'router-state.json');
    const dedupeFile = path.join(tmpDir, 'routing-block-dedupe.json');

    // Router mode, no task spawned — ensures checks engage
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ mode: 'router', taskSpawned: false, plannerSpawned: false })
    );

    process.env.ROUTER_STATE_FILE = stateFile;
    process.env.ROUTING_BLOCK_DEDUPE_PATH = dedupeFile;
    process.env.CLAUDE_SESSION_ID = 'test-checks-router-wt';
    process.env.ROUTER_BASH_GUARD = 'block';
    process.env.ROUTER_SELF_CHECK = 'block';
    delete process.env.CLAUDE_AGENT_ID;

    // Invalidate shared state cache so each test starts fresh
    const sharedPath = require.resolve(
      '../../.claude/hooks/routing/routing-guard-core.shared.cjs'
    );
    if (require.cache[sharedPath]) {
      require(sharedPath).invalidateCachedState();
    }

    // Fresh module load to avoid stale require.cache
    const checksRouterPath = require.resolve(
      '../../.claude/hooks/routing/routing-guard-core.checks-router.cjs'
    );
    delete require.cache[checksRouterPath];
    const mod = require('../../.claude/hooks/routing/routing-guard-core.checks-router.cjs');
    checkRouterBash = mod.checkRouterBash;
    checkRouterSelfCheck = mod.checkRouterSelfCheck;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  // ── RED: worktree bypass is missing ─────────────────────────────────────────
  //
  // These tests pass a worktree CWD as the 4th argument.  On current code that
  // argument is IGNORED (function signature only has 3 params), so
  // hasExplicitAgentContext falls back to process.cwd() which is NOT a worktree,
  // and the checks BLOCK instead of passing.  After D2-impl adds the cwd param,
  // these become GREEN.

  it('checkRouterBash: allows Bash when CWD is POSIX worktree path', () => {
    const worktreeCwd = '/project/.claude/worktrees/agent-abc123';
    // RED: currently cwd arg ignored → process.cwd() used → not worktree → BLOCKS
    const result = checkRouterBash('Bash', { command: 'npm test' }, {}, worktreeCwd);
    assert.strictEqual(
      result.pass,
      true,
      `checkRouterBash must bypass ROUTER_BASH_GUARD when CWD is inside a worktree; ` +
        `got pass=${result.pass} result=${result.result}`
    );
  });

  it('checkRouterBash: allows Bash when CWD is Windows worktree path (SE-01)', () => {
    const winWorktreeCwd = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
    const result = checkRouterBash('Bash', { command: 'npm test' }, {}, winWorktreeCwd);
    assert.strictEqual(
      result.pass,
      true,
      `checkRouterBash must bypass for Windows backslash worktree CWD; ` +
        `got pass=${result.pass} result=${result.result}`
    );
  });

  it('checkRouterBash: allows nested worktree CWD (depth-2)', () => {
    const nestedCwd = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
    const result = checkRouterBash('Bash', { command: 'node index.js' }, {}, nestedCwd);
    assert.strictEqual(
      result.pass,
      true,
      `checkRouterBash must bypass for nested (depth-2) worktree CWD; ` +
        `got pass=${result.pass}`
    );
  });

  it('checkRouterSelfCheck: allows blacklisted tool when CWD is POSIX worktree path', () => {
    const worktreeCwd = '/project/.claude/worktrees/agent-abc123';
    // 'Edit' is in BLACKLISTED_TOOLS — normally blocked for router
    // RED: cwd arg currently ignored → not worktree → BLOCKS
    const result = checkRouterSelfCheck('Edit', {}, {}, worktreeCwd);
    assert.strictEqual(
      result.pass,
      true,
      `checkRouterSelfCheck must bypass ROUTER_SELF_CHECK when CWD is inside a worktree; ` +
        `got pass=${result.pass} result=${result.result}`
    );
  });

  it('checkRouterSelfCheck: allows blacklisted tool when CWD is Windows worktree path (SE-01)', () => {
    const winWorktreeCwd = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
    const result = checkRouterSelfCheck('Write', {}, {}, winWorktreeCwd);
    assert.strictEqual(
      result.pass,
      true,
      `checkRouterSelfCheck must bypass for Windows backslash worktree CWD; ` +
        `got pass=${result.pass}`
    );
  });

  // ── Non-regression: enforcement still applies outside worktrees ─────────────

  it('checkRouterBash: still blocks non-whitelisted Bash from non-worktree CWD', () => {
    const result = checkRouterBash('Bash', { command: 'npm test' }, {}, '/project');
    assert.strictEqual(
      result.pass,
      false,
      'Non-worktree non-whitelisted Bash must still be blocked'
    );
    assert.strictEqual(result.result, 'block');
  });

  it('checkRouterSelfCheck: still blocks blacklisted tool from non-worktree CWD', () => {
    const result = checkRouterSelfCheck('Edit', {}, {}, '/project');
    assert.strictEqual(
      result.pass,
      false,
      'Non-worktree Edit must still be blocked for router'
    );
    assert.strictEqual(result.result, 'block');
  });

  it('checkRouterBash: whitelisted git command still passes from non-worktree CWD', () => {
    const result = checkRouterBash('Bash', { command: 'git status -s' }, {}, '/project');
    assert.strictEqual(result.pass, true, 'Whitelisted git command must always pass');
  });
});
