'use strict';

/**
 * stub-scripts.test.cjs
 *
 * Verifies that previously-stubbed skill scripts and tool files are now
 * functional wrappers that:
 *   1. Do NOT contain "Not implemented" placeholder text
 *   2. Do NOT contain "currently a scaffold and has no implementation"
 *   3. Have valid JavaScript syntax (node --check)
 *   4. Exit 0 when invoked (with --help or bare)
 *
 * Also performs a targeted scan of .claude/skills and .claude/tools to
 * ensure no short (≤30-line) files with the "Not implemented" placeholder
 * and process.exit(1) remain in the codebase (specifically targets the
 * github-ops style stubs, not the broader scaffold-warning category which
 * is tracked separately).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ─── Project root ─────────────────────────────────────────────────────────────

function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.claude', 'settings.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate project root from: ' + start);
}

const PROJECT_ROOT = findProjectRoot(__dirname);

// ─── Helper utilities ─────────────────────────────────────────────────────────

/**
 * Read a file's content (returns '' if missing).
 */
function readFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Run `node --check <file>` and return true if syntax is valid.
 */
function syntaxCheck(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  return result.status === 0;
}

/**
 * Spawn `node <filePath> [args]` and return the exit code.
 */
function runScript(filePath, args) {
  const result = spawnSync(process.execPath, [filePath, ...(args || [])], {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: '' },
  });
  return result.status;
}

// ─── Known stub file paths ────────────────────────────────────────────────────

const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude', 'skills');
const TOOLS_DIR = path.join(PROJECT_ROOT, '.claude', 'tools');

const KNOWN_STUBS = {
  implementationReadiness: path.join(SKILLS_DIR, 'implementation-readiness', 'scripts', 'main.cjs'),
  githubMcpPreExecute: path.join(SKILLS_DIR, 'github-mcp', 'hooks', 'pre-execute.cjs'),
  githubMcpPostExecute: path.join(SKILLS_DIR, 'github-mcp', 'hooks', 'post-execute.cjs'),
  differentialReviewPreExecute: path.join(
    SKILLS_DIR,
    'differential-review',
    'hooks',
    'pre-execute.cjs'
  ),
  differentialReviewPostExecute: path.join(
    SKILLS_DIR,
    'differential-review',
    'hooks',
    'post-execute.cjs'
  ),
  githubOps: path.join(TOOLS_DIR, 'github-ops', 'github-ops.cjs'),
};

// ─── Stub detection helpers ───────────────────────────────────────────────────

/**
 * Returns true if the file is a "Not implemented" stub:
 *   - ≤30 lines of code AND
 *   - contains the exact 'Not implemented' placeholder text AND
 *   - contains process.exit(1) as primary action
 *
 * NOTE: This intentionally targets only the "Not implemented" pattern
 * (as used in github-ops.cjs) and does NOT match the broader
 * "currently a scaffold and has no implementation" pattern that exists
 * in many other pre-existing scaffold files outside the scope of this fix.
 */
function isStub(filePath) {
  const content = readFile(filePath);
  if (!content) return false;
  const lines = content.split('\n');
  if (lines.length > 30) return false;
  const hasNotImplemented = content.includes('Not implemented');
  const hasExit1 = content.includes('process.exit(1)');
  return hasNotImplemented && hasExit1;
}

/**
 * Returns true if the file contains 'Not implemented' (exact stub pattern
 * from github-ops.cjs format).
 */
function hasNotImplementedMarker(filePath) {
  const content = readFile(filePath);
  return content.includes('Not implemented');
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('stub-scripts: known stubs are fixed', () => {
  it('implementation-readiness main.cjs exists', () => {
    assert.ok(
      fs.existsSync(KNOWN_STUBS.implementationReadiness),
      `Expected ${KNOWN_STUBS.implementationReadiness} to exist`
    );
  });

  it('implementation-readiness main.cjs has no stub markers', () => {
    const content = readFile(KNOWN_STUBS.implementationReadiness);
    assert.ok(
      !content.includes('currently a scaffold and has no implementation'),
      'Should not contain scaffold warning'
    );
    assert.ok(!content.includes('Not implemented'), 'Should not contain "Not implemented"');
  });

  it('implementation-readiness main.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.implementationReadiness), 'Syntax check failed');
  });

  it('implementation-readiness main.cjs exits 0 with --help', () => {
    const code = runScript(KNOWN_STUBS.implementationReadiness, ['--help']);
    assert.strictEqual(code, 0, 'Expected exit code 0');
  });

  it('implementation-readiness main.cjs exits 0 with no args', () => {
    const code = runScript(KNOWN_STUBS.implementationReadiness, []);
    assert.strictEqual(code, 0, 'Expected exit code 0 with no args');
  });
});

describe('stub-scripts: github-mcp hooks are functional', () => {
  it('github-mcp pre-execute.cjs exists', () => {
    assert.ok(
      fs.existsSync(KNOWN_STUBS.githubMcpPreExecute),
      `Expected ${KNOWN_STUBS.githubMcpPreExecute} to exist`
    );
  });

  it('github-mcp pre-execute.cjs has no TODO placeholder', () => {
    const content = readFile(KNOWN_STUBS.githubMcpPreExecute);
    // Allow documentation TODOs but not placeholder logic TODOs
    const lines = content.split('\n');
    const todoLines = lines.filter(
      l => /\/\/\s*TODO:/i.test(l) && l.includes('Add your validation logic')
    );
    assert.strictEqual(todoLines.length, 0, 'Should not contain TODO placeholder logic');
  });

  it('github-mcp pre-execute.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.githubMcpPreExecute), 'Syntax check failed');
  });

  it('github-mcp pre-execute.cjs exits 0', () => {
    const code = runScript(KNOWN_STUBS.githubMcpPreExecute, []);
    assert.strictEqual(code, 0, 'Expected exit code 0');
  });

  it('github-mcp post-execute.cjs exists', () => {
    assert.ok(
      fs.existsSync(KNOWN_STUBS.githubMcpPostExecute),
      `Expected ${KNOWN_STUBS.githubMcpPostExecute} to exist`
    );
  });

  it('github-mcp post-execute.cjs has no TODO placeholder', () => {
    const content = readFile(KNOWN_STUBS.githubMcpPostExecute);
    const lines = content.split('\n');
    const todoLines = lines.filter(
      l => /\/\/\s*TODO:/i.test(l) && l.includes('Add your post-processing logic')
    );
    assert.strictEqual(todoLines.length, 0, 'Should not contain TODO placeholder logic');
  });

  it('github-mcp post-execute.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.githubMcpPostExecute), 'Syntax check failed');
  });

  it('github-mcp post-execute.cjs exits 0', () => {
    const code = runScript(KNOWN_STUBS.githubMcpPostExecute, []);
    assert.strictEqual(code, 0, 'Expected exit code 0');
  });
});

describe('stub-scripts: differential-review hooks are functional', () => {
  it('differential-review pre-execute.cjs exists', () => {
    assert.ok(
      fs.existsSync(KNOWN_STUBS.differentialReviewPreExecute),
      `Expected ${KNOWN_STUBS.differentialReviewPreExecute} to exist`
    );
  });

  it('differential-review pre-execute.cjs is a script (has shebang or process.exit)', () => {
    const content = readFile(KNOWN_STUBS.differentialReviewPreExecute);
    const isScript = content.startsWith('#!/usr/bin/env node') || content.includes('process.exit(');
    assert.ok(isScript, 'Expected hook to be an executable script');
  });

  it('differential-review pre-execute.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.differentialReviewPreExecute), 'Syntax check failed');
  });

  it('differential-review pre-execute.cjs exits 0', () => {
    const code = runScript(KNOWN_STUBS.differentialReviewPreExecute, []);
    assert.strictEqual(code, 0, 'Expected exit code 0');
  });

  it('differential-review post-execute.cjs exists', () => {
    assert.ok(
      fs.existsSync(KNOWN_STUBS.differentialReviewPostExecute),
      `Expected ${KNOWN_STUBS.differentialReviewPostExecute} to exist`
    );
  });

  it('differential-review post-execute.cjs is a script (has shebang or process.exit)', () => {
    const content = readFile(KNOWN_STUBS.differentialReviewPostExecute);
    const isScript = content.startsWith('#!/usr/bin/env node') || content.includes('process.exit(');
    assert.ok(isScript, 'Expected hook to be an executable script');
  });

  it('differential-review post-execute.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.differentialReviewPostExecute), 'Syntax check failed');
  });

  it('differential-review post-execute.cjs exits 0', () => {
    const code = runScript(KNOWN_STUBS.differentialReviewPostExecute, []);
    assert.strictEqual(code, 0, 'Expected exit code 0');
  });
});

describe('stub-scripts: github-ops tool is functional', () => {
  it('github-ops.cjs exists', () => {
    assert.ok(fs.existsSync(KNOWN_STUBS.githubOps), `Expected ${KNOWN_STUBS.githubOps} to exist`);
  });

  it('github-ops.cjs does not contain "Not implemented"', () => {
    assert.ok(
      !hasNotImplementedMarker(KNOWN_STUBS.githubOps),
      'Should not contain "Not implemented"'
    );
  });

  it('github-ops.cjs has valid syntax', () => {
    assert.ok(syntaxCheck(KNOWN_STUBS.githubOps), 'Syntax check failed');
  });

  it('github-ops.cjs exits 0 with --help', () => {
    const code = runScript(KNOWN_STUBS.githubOps, ['--help']);
    assert.strictEqual(code, 0, 'Expected exit code 0 with --help');
  });
});

describe('stub-scripts: broad scan for remaining stubs', () => {
  /**
   * Scan only .claude/skills/<skill>/scripts/main.cjs files for the
   * "Not implemented" stub pattern (≤30 lines + 'Not implemented' + exit(1)).
   *
   * The broader .claude/tools/ directory contains pre-existing tool wrapper
   * stubs that are tracked separately; this test only covers the skill scripts
   * and the specific tools fixed by this feature (github-ops).
   */
  it('no skill scripts/main.cjs contain "Not implemented" + process.exit(1)', () => {
    if (!fs.existsSync(SKILLS_DIR)) {
      return; // No skills directory; nothing to scan
    }

    const skillEntries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const skillMainFiles = skillEntries
      .filter(e => e.isDirectory())
      .map(e => path.join(SKILLS_DIR, e.name, 'scripts', 'main.cjs'))
      .filter(f => fs.existsSync(f));

    const remaining = skillMainFiles.filter(f => isStub(f));

    if (remaining.length > 0) {
      const rel = remaining.map(f => path.relative(PROJECT_ROOT, f));
      assert.fail(
        `Found ${remaining.length} skill script(s) still containing "Not implemented" + process.exit(1):\n  ${rel.join('\n  ')}`
      );
    }

    assert.strictEqual(remaining.length, 0, 'No skill main.cjs stubs should remain');
  });

  it('implementation-readiness main.cjs is no longer a stub', () => {
    assert.ok(
      !isStub(KNOWN_STUBS.implementationReadiness),
      'implementation-readiness/scripts/main.cjs should not be a stub'
    );
  });

  it('github-ops.cjs is no longer a stub', () => {
    assert.ok(!isStub(KNOWN_STUBS.githubOps), 'github-ops.cjs should not be a stub');
  });

  it('no known stub files have "Not implemented" text', () => {
    for (const [name, filePath] of Object.entries(KNOWN_STUBS)) {
      assert.ok(
        !hasNotImplementedMarker(filePath),
        `${name} (${path.relative(PROJECT_ROOT, filePath)}) still contains "Not implemented"`
      );
    }
  });
});
