'use strict';

/**
 * broken-imports.test.cjs
 *
 * Programmatically scans every .cjs file in .claude/lib/ and .claude/hooks/
 * for relative require() calls and verifies each resolves to an existing file.
 * Also checks that every .test.cjs file in tests/ which imports from .claude/
 * has working imports, and that every hook registered in settings.json can be
 * run without MODULE_NOT_FOUND errors (using spawnSync with closed stdin so
 * hooks that read stdin still exit promptly).
 *
 * Uses require-analyzer.cjs to strip comments before scanning, avoiding false
 * positives from JSDoc examples or regex literals.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
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

const ROOT = findProjectRoot(__dirname);

// ─── Require-analyzer (comment-aware import extractor) ───────────────────────

const { extractRequires, resolveRequirePath } = require(
  path.join(ROOT, '.claude', 'lib', 'utils', 'require-analyzer.cjs')
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively find all .cjs files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findCjsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCjsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.cjs')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Check whether a relative require path can be resolved to an existing file.
 * Tries the path as-is, and with common CJS extensions appended.
 *
 * @param {string} reqPath  - The raw require() argument
 * @param {string} fromFile - Absolute path of the importing file
 * @returns {boolean}
 */
function requireTargetExists(reqPath, fromFile) {
  const resolved = resolveRequirePath(reqPath, fromFile);
  if (!resolved) return true; // resolveRequirePath skips non-relative / builtins
  const candidates = [
    resolved,
    resolved + '.cjs',
    resolved + '.js',
    path.join(resolved, 'index.cjs'),
    path.join(resolved, 'index.js'),
  ];
  return candidates.some(c => fs.existsSync(c));
}

/**
 * Scan a list of .cjs files and collect broken relative require() paths.
 * Uses comment-aware extraction to avoid false positives.
 *
 * @param {string[]} files
 * @returns {{ file: string, line: number, require: string }[]}
 */
function collectBrokenImports(files) {
  const broken = [];
  for (const file of files) {
    const { requires } = extractRequires(file);
    for (const req of requires) {
      if (!req.isRelative) continue;
      if (!requireTargetExists(req.raw, file)) {
        broken.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          line: req.line,
          require: req.raw,
        });
      }
    }
  }
  return broken;
}

/**
 * Extract hook .cjs paths from settings.json hooks config.
 * @returns {string[]} relative paths like ".claude/hooks/..."
 */
function collectSettingsHookPaths() {
  const settingsPath = path.join(ROOT, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const acc = new Set();

  function walk(obj) {
    if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (obj !== null && typeof obj === 'object') {
      if (typeof obj.command === 'string') {
        const m = obj.command.match(/node\s+([\w./\\-]+\.cjs)/);
        if (m) acc.add(m[1]);
      }
      Object.values(obj).forEach(walk);
    }
  }

  walk(settings.hooks);
  return [...acc];
}

// ─── Directories to scan ─────────────────────────────────────────────────────

const LIB_DIR = path.join(ROOT, '.claude', 'lib');
const HOOKS_DIR = path.join(ROOT, '.claude', 'hooks');
const TESTS_DIR = path.join(ROOT, 'tests');

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('broken-imports: .claude/lib relative require() calls', () => {
  it('all lib/ relative imports resolve to existing files', () => {
    const files = findCjsFiles(LIB_DIR);
    assert.ok(files.length > 0, 'Expected to find .cjs files in .claude/lib/');
    const broken = collectBrokenImports(files);
    assert.deepStrictEqual(
      broken,
      [],
      `${broken.length} broken import(s) found in .claude/lib/:\n` +
        broken.map(b => `  ${b.file}:${b.line}: require('${b.require}')`).join('\n')
    );
  });
});

describe('broken-imports: .claude/hooks relative require() calls', () => {
  it('all hooks/ relative imports resolve to existing files', () => {
    const files = findCjsFiles(HOOKS_DIR);
    assert.ok(files.length > 0, 'Expected to find .cjs files in .claude/hooks/');
    const broken = collectBrokenImports(files);
    assert.deepStrictEqual(
      broken,
      [],
      `${broken.length} broken import(s) found in .claude/hooks/:\n` +
        broken.map(b => `  ${b.file}:${b.line}: require('${b.require}')`).join('\n')
    );
  });
});

describe('broken-imports: test files importing from .claude/', () => {
  it('all .test.cjs files have resolvable .claude/ imports', () => {
    const testFiles = findCjsFiles(TESTS_DIR).filter(f => f.endsWith('.test.cjs'));
    const broken = [];

    for (const file of testFiles) {
      const { requires } = extractRequires(file);
      for (const req of requires) {
        if (!req.isRelative) continue;
        // Only flag imports that reference .claude/ paths
        const resolved = resolveRequirePath(req.raw, file);
        if (!resolved) continue;
        const relResolved = path.relative(ROOT, resolved).replace(/\\/g, '/');
        if (!relResolved.startsWith('.claude/')) continue;
        if (!requireTargetExists(req.raw, file)) {
          broken.push({
            file: path.relative(ROOT, file).replace(/\\/g, '/'),
            line: req.line,
            require: req.raw,
          });
        }
      }
    }

    assert.deepStrictEqual(
      broken,
      [],
      `${broken.length} broken .claude/ import(s) in test files:\n` +
        broken.map(b => `  ${b.file}:${b.line}: require('${b.require}')`).join('\n')
    );
  });
});

describe('broken-imports: registered hooks have no MODULE_NOT_FOUND errors', () => {
  let hookPaths;

  before(() => {
    hookPaths = collectSettingsHookPaths();
  });

  it('every registered hook file exists on disk', () => {
    const missing = hookPaths.filter(p => !fs.existsSync(path.join(ROOT, p)));
    assert.deepStrictEqual(
      missing,
      [],
      `${missing.length} registered hook(s) are missing from disk:\n  ` + missing.join('\n  ')
    );
  });

  it('every registered hook runs without MODULE_NOT_FOUND errors (empty stdin)', () => {
    // Run each hook as a child process with empty/closed stdin.
    // Hooks that read stdin will receive an immediate 'end' event and exit.
    // Hooks with require.main guards will skip their main logic and exit 0.
    // We only fail if a MODULE_NOT_FOUND error is reported in stderr.
    const failures = [];

    for (const relPath of hookPaths) {
      const absPath = path.join(ROOT, relPath.replace(/\//g, path.sep));
      if (!fs.existsSync(absPath)) continue; // covered by previous test

      const result = spawnSync(process.execPath, [absPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        input: '', // Close stdin immediately so hooks that read stdin can finish
        timeout: 8000,
        encoding: 'utf8',
        cwd: ROOT,
        env: {
          ...process.env,
          // Disable auto-start features to prevent hanging subprocesses
          A2A_AUTO_START: 'false',
          CHANNEL_AUTO_START: 'false',
        },
      });

      if (result.error && result.error.code === 'ETIMEDOUT') {
        failures.push(`${relPath}: timed out (possible stdin hang)`);
        continue;
      }

      const stderr = result.stderr || '';
      if (stderr.includes('Cannot find module') || stderr.includes('MODULE_NOT_FOUND')) {
        failures.push(`${relPath}: broken import - ${stderr.trim().split('\n')[0]}`);
      }
    }

    assert.deepStrictEqual(
      failures,
      [],
      `${failures.length} hook(s) have broken imports or hung:\n  ` + failures.join('\n  ')
    );
  });
});
