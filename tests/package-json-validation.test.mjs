#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();

test('package.json should not reference missing boot files', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  // These scripts should not exist (they reference archived boot files)
  assert.strictEqual(
    pkg.scripts['agent:production'],
    undefined,
    'agent:production script should be removed (boot file archived)'
  );

  assert.strictEqual(
    pkg.scripts['agent:worker'],
    undefined,
    'agent:worker script should be removed (boot file archived)'
  );
});

test('test:framework should use real tests globs, not archived .claude paths', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const script = pkg.scripts['test:framework'] || '';

  assert.ok(script.length > 0, 'test:framework script should be defined');
  assert.ok(
    !script.includes('.claude/hooks/**/*.test.cjs'),
    'test:framework should not reference archived .claude/hooks test globs'
  );
  assert.ok(
    !script.includes('.claude/lib/**/*.test.cjs'),
    'test:framework should not reference archived .claude/lib test globs'
  );
  assert.ok(
    script.includes('tests/hooks') && script.includes('tests/lib'),
    'test:framework should point at real tests/hooks and tests/lib globs'
  );
});

test('test:framework:hooks should use real tests hooks globs', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const script = pkg.scripts['test:framework:hooks'] || '';

  assert.ok(script.length > 0, 'test:framework:hooks script should be defined');
  assert.ok(
    !script.includes('.claude/hooks/**/*.test.cjs'),
    'test:framework:hooks should not reference archived .claude/hooks test globs'
  );
  assert.ok(
    script.includes('tests/hooks'),
    'test:framework:hooks should point at real tests/hooks globs'
  );
});

test('test script should run actual tests and fail if 0 tests found', () => {
  // The test script should match actual test files
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const testScript = pkg.scripts['test'];

  assert.ok(testScript, 'test script should exist');
  assert.ok(
    testScript.includes('scripts/testing/run-node-tests.cjs'),
    'test script should use the cross-platform test runner wrapper'
  );
  assert.ok(
    testScript.includes('--pattern=tests/**/*.test.{mjs,cjs}'),
    'test script should target the recursive .mjs/.cjs test glob via the wrapper'
  );
});

test('framework test scripts should use the cross-platform test runner wrapper', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const frameworkScript = pkg.scripts['test:framework'] || '';
  const hooksScript = pkg.scripts['test:framework:hooks'] || '';
  const libScript = pkg.scripts['test:framework:lib'] || '';

  assert.ok(
    frameworkScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework should use the cross-platform test runner wrapper'
  );
  assert.ok(
    hooksScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework:hooks should use the cross-platform test runner wrapper'
  );
  assert.ok(
    libScript.includes('scripts/testing/run-node-tests.cjs'),
    'test:framework:lib should use the cross-platform test runner wrapper'
  );
  assert.ok(
    frameworkScript.includes('--pattern=tests/hooks/*.test.cjs') &&
      frameworkScript.includes('--pattern=tests/lib/**/*.test.cjs') &&
      frameworkScript.includes('--pattern=tests/cli/*.test.cjs'),
    'test:framework should target the actual framework test globs via the wrapper'
  );
  assert.ok(
    hooksScript.includes('--pattern=tests/hooks/*.test.cjs'),
    'test:framework:hooks should target the hook tests glob via the wrapper'
  );
  assert.ok(
    libScript.includes('--pattern=tests/lib/**/*.test.cjs') &&
      libScript.includes('--pattern=tests/cli/*.test.cjs'),
    'test:framework:lib should target the library and cli test globs via the wrapper'
  );
});

test('CI-facing node test scripts should avoid shell-quoted globs', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  for (const scriptName of [
    'test',
    'test:framework',
    'test:framework:hooks',
    'test:framework:lib',
    'test:ci',
  ]) {
    const script = pkg.scripts[scriptName] || '';

    assert.ok(
      !script.includes('"tests/') && !script.includes("'tests/"),
      `${scriptName} should not pass shell-quoted tests globs directly to node --test`
    );
  }
});

test('test:integration should match recursive integration tests', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const integrationScript = pkg.scripts['test:integration'];

  assert.ok(integrationScript, 'test:integration script should exist');
  assert.ok(
    integrationScript.includes('--test-concurrency=1'),
    'test:integration should run sequentially like the main Node test suites'
  );
  assert.ok(
    integrationScript.includes('tests/integration/**/*.test'),
    'test:integration should use a recursive integration glob'
  );
  assert.ok(
    integrationScript.includes('{mjs,cjs}'),
    'test:integration should include active .cjs integration tests'
  );
  assert.ok(
    !integrationScript.includes('tests/integration/*.test.mjs'),
    'test:integration must not use the old root-only .mjs glob that matched zero tests'
  );
});

test('count-all-tests.mjs should report failed test files, not hide them', () => {
  const scriptPath = join(PROJECT_ROOT, 'scripts', 'testing', 'count-all-tests.mjs');
  const script = readFileSync(scriptPath, 'utf-8');

  // Should NOT just catch errors and continue silently
  // The catch block at line 43-44 should log the failure AND count it
  const catchBlock = script.match(/catch\s*\([^)]+\)\s*{([^}]+)}/s);

  assert.ok(catchBlock, 'Script should have error handling');

  // The catch block should log the error (not just to console.error)
  // AND it should affect the final summary (not just skip the file)
  const catchContent = catchBlock[1];

  // Should log the error
  assert.ok(catchContent.includes('console.error'), 'Should log test file failures');

  // After fix, it should track failed files in the summary
  // For now, this will fail because the current code doesn't do this
  const hasFailedFileTracking =
    script.includes('failedFiles') ||
    script.includes('failed:') ||
    script.includes('Total failed files');

  assert.ok(
    hasFailedFileTracking,
    'Script should track and report the number of test files that failed to run'
  );
});

test('validate:sync script should work on Windows without bash', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const syncScript = pkg.scripts['validate:sync'];

  // Should not start with "bash"
  assert.ok(
    !syncScript.startsWith('bash '),
    'validate:sync should not require bash (not available on Windows by default)'
  );

  // Should use node
  assert.ok(
    syncScript.startsWith('node '),
    'validate:sync should use node for cross-platform compatibility'
  );
});

test('validate-sync supports strict mode for CI parity enforcement', () => {
  const scriptPath = join(PROJECT_ROOT, 'scripts', 'validation', 'validate-sync.mjs');
  const script = readFileSync(scriptPath, 'utf-8');

  assert.ok(script.includes('--strict'), 'validate-sync should expose a --strict mode');
  assert.ok(
    script.includes('VALIDATE_SYNC_STRICT'),
    'validate-sync should support strict mode through an environment variable'
  );
  assert.ok(
    script.includes('warnings treated as errors'),
    'strict mode should fail when parity warnings are present'
  );
});

test('validate-sync strict mode passes for the current multi-tool bundle contracts', () => {
  const output = execFileSync(
    process.execPath,
    ['scripts/validation/validate-sync.mjs', '--strict'],
    {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    }
  );

  assert.ok(output.includes('All checks passed!'), 'strict validate-sync should pass cleanly');
  assert.ok(!output.includes('[WARN]'), 'strict validate-sync should not emit warnings');
});

test('bash validate-sync mirrors the current catalog ownership model', () => {
  const scriptPath = join(PROJECT_ROOT, 'scripts', 'validation', 'validate-sync.sh');
  const script = readFileSync(scriptPath, 'utf-8');

  assert.ok(
    !script.includes('.factory/droids'),
    'bash validate-sync should not require legacy .factory/droids'
  );
  assert.ok(
    !script.includes('"CLAUDE.md"') && !script.includes("'CLAUDE.md'"),
    'bash validate-sync should not require root CLAUDE.md'
  );
  assert.ok(
    !script.includes('CLAUDE_AGENTS" -eq "$CURSOR_AGENTS') &&
      !script.includes('CLAUDE_AGENTS" -eq "$FACTORY_AGENTS'),
    'bash validate-sync should not enforce one-to-one agent parity counts'
  );
  assert.ok(
    script.includes('.claude/CLAUDE.md'),
    'bash validate-sync should require .claude/CLAUDE.md as the canonical Claude doc'
  );
  assert.ok(
    script.includes('.factory/skills'),
    'bash validate-sync should validate Factory worker contracts under .factory/skills'
  );
});

test('bash validate-sync checks Cursor routed agents and strict warnings mode', () => {
  const scriptPath = join(PROJECT_ROOT, 'scripts', 'validation', 'validate-sync.sh');
  const script = readFileSync(scriptPath, 'utf-8');

  assert.ok(
    script.includes('VALIDATE_SYNC_STRICT'),
    'bash validate-sync should support strict mode through an environment variable'
  );
  assert.ok(script.includes('--strict'), 'bash validate-sync should expose a --strict mode');
  assert.ok(
    script.includes('agent_routing'),
    'bash validate-sync should inspect .cursor/config.yaml agent_routing entries'
  );
  assert.ok(
    script.includes('.cursor/subagents/${agent}.mdc'),
    'bash validate-sync should validate routed agents against matching Cursor subagent files'
  );
  assert.ok(
    script.includes('REQUIRED_CURSOR_SKILLS'),
    'bash validate-sync should validate the required Cursor utility skills'
  );
});

test('validate:full should include agent skill reference validation', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const fullScript = pkg.scripts['validate:full'] || '';

  assert.ok(
    fullScript.includes('pnpm validate:agent-skill-refs'),
    'validate:full should run validate:agent-skill-refs to catch broken Skill() references'
  );
});

test('validate:full should not mutate generated rule index outputs', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const fullScript = pkg.scripts['validate:full'] || '';

  assert.ok(
    fullScript.includes('pnpm validate:index-paths'),
    'validate:full should validate the generated rule index paths'
  );
  assert.ok(
    !/(^|&&)\s*pnpm index-rules(\s|&&|$)/.test(fullScript),
    'validate:full must not run mutating pnpm index-rules; generation should be explicit'
  );
});

test('test:coverage should use recursive active test globs', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const coverageScript = pkg.scripts['test:coverage'] || '';

  assert.ok(
    coverageScript.includes('--experimental-test-coverage'),
    'test:coverage should enable Node test coverage'
  );
  assert.ok(
    coverageScript.includes('tests/**/*.test') && coverageScript.includes('{mjs,cjs}'),
    'test:coverage should cover recursive .mjs and .cjs tests'
  );
  assert.ok(
    !coverageScript.includes('tests/*.test.mjs'),
    'test:coverage must not use the old root-only .mjs glob'
  );
});

test('validate:status-check-governance script should exist', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const script = pkg.scripts['validate:status-check-governance'] || '';

  assert.ok(script.length > 0, 'validate:status-check-governance script should be defined');
  assert.ok(
    script.includes('tests/workflows/branch-protection-audit.test.cjs'),
    'validate:status-check-governance should run branch protection governance tests'
  );
  assert.ok(
    script.includes('tests/workflows/required-status-checks-config.test.cjs'),
    'validate:status-check-governance should validate required status checks config'
  );
});

test('pnpm allowBuilds should approve better-sqlite3 native bindings', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const workspaceConfig = readFileSync(join(PROJECT_ROOT, 'pnpm-workspace.yaml'), 'utf-8');

  assert.ok(
    /^ {2}better-sqlite3:\s*true$/m.test(workspaceConfig),
    'pnpm-workspace.yaml allowBuilds should approve better-sqlite3 so CI builds native bindings'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(pkg.dependencies || {}, 'better-sqlite3'),
    'better-sqlite3 should remain a direct dependency when listed in allowBuilds'
  );
});

test('ESLint flat config replaces .eslintignore for node_modules and worktrees', () => {
  assert.ok(
    !existsSync(join(PROJECT_ROOT, '.eslintignore')),
    '.eslintignore should be removed; ignore paths belong in eslint.config.js'
  );
  const cfg = readFileSync(join(PROJECT_ROOT, 'eslint.config.js'), 'utf-8');
  assert.ok(cfg.includes('ignores:'), 'eslint.config.js should define a global ignores block');
  assert.ok(cfg.includes('node_modules/'), 'eslint.config.js ignores should include node_modules/');
  assert.ok(
    cfg.includes('.claude/worktrees'),
    'eslint.config.js ignores should include .claude/worktrees (was in .eslintignore)'
  );
});

test('validate:full should include status check governance validation', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const fullScript = pkg.scripts['validate:full'] || '';

  assert.ok(
    fullScript.includes('pnpm validate:status-check-governance'),
    'validate:full should run status check governance validation'
  );
});

test('better-sqlite3 should be listed in onlyBuiltDependencies for CI native builds', () => {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const builtDeps = pkg?.pnpm?.onlyBuiltDependencies || [];

  assert.ok(
    Array.isArray(builtDeps) && builtDeps.includes('better-sqlite3'),
    'pnpm.onlyBuiltDependencies should include better-sqlite3 so CI builds its native binding'
  );
});
