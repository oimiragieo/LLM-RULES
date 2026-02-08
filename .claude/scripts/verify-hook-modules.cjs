#!/usr/bin/env node
// CI Hook Module-Resolution Verification Script
// Agent: developer | Task: #57 | Session: 2026-02-07
'use strict';

const fs = require('fs');
const path = require('path');
const { extractRequires, resolveRequirePath } = require('../lib/utils/require-analyzer.cjs');

// Constants
const DEFAULT_HOOKS_DIR = '.claude/hooks';
const DEFAULT_SETTINGS_PATH = '.claude/settings.json';
const ARCHIVE_EXCLUDE = '_archive';

/**
 * Recursively discover all .cjs files in a directory, excluding _archive
 *
 * @param {string} dir - Directory to scan
 * @param {string} projectRoot - Project root for relative path calculation
 * @returns {string[]} Array of absolute file paths
 */
function discoverHookFiles(dir, projectRoot) {
  const files = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip _archive directory
      if (entry.isDirectory() && entry.name === ARCHIVE_EXCLUDE) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        files.push(...discoverHookFiles(fullPath, projectRoot));
      } else if (entry.isFile() && entry.name.endsWith('.cjs')) {
        files.push(fullPath);
      }
    }
  } catch (_err) {
    // Directory read error - skip silently
  }

  return files;
}

/**
 * Cross-reference settings.json hook registrations
 *
 * @param {string} projectRoot - Project root directory
 * @param {string} settingsPath - Path to settings.json
 * @param {Object} results - Results object to update
 */
function crossReferenceSettings(projectRoot, settingsPath, results) {
  if (!fs.existsSync(settingsPath)) {
    return;
  }

  try {
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(settingsContent);

    results.settingsCheck.checked = true;

    if (!settings.hooks) {
      return;
    }

    // Check all hook types
    const hookTypes = ['preToolUse', 'postToolUse', 'onMessage', 'onComplete'];
    for (const hookType of hookTypes) {
      const hooks = settings.hooks[hookType];
      if (!Array.isArray(hooks)) {
        continue;
      }

      for (const hook of hooks) {
        if (!hook.command) {
          continue;
        }

        // Extract file path from command (e.g., "node .claude/hooks/routing/routing-guard.cjs")
        const match = hook.command.match(/\.claude\/hooks\/[^\s]+\.cjs/);
        if (!match) {
          continue;
        }

        const hookPath = match[0];
        const fullPath = path.join(projectRoot, hookPath);

        if (!fs.existsSync(fullPath)) {
          results.settingsCheck.missing.push(hookPath);
        }
      }
    }
  } catch (err) {
    // Settings.json parse error - this is critical
    results.settingsCheck.error = err.message;
  }
}

/**
 * Verify hooks - core verification logic
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root directory
 * @returns {{ passed: number, failed: number, results: Array }}
 */
function verifyHooks(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const hooksDir = path.join(projectRoot, DEFAULT_HOOKS_DIR);
  const settingsPath = path.join(projectRoot, DEFAULT_SETTINGS_PATH);

  const results = {
    passed: 0,
    failed: 0,
    results: [],
    settingsCheck: {
      checked: false,
      missing: [],
    },
  };

  // Discover all hook files
  const hookFiles = discoverHookFiles(hooksDir, projectRoot);

  // Verify each hook file
  for (const hookFile of hookFiles) {
    const hookRelative = path.relative(projectRoot, hookFile).replace(/\\/g, '/');
    const { requires, errors } = extractRequires(hookFile);

    const brokenRequires = [];

    // Check each require
    for (const req of requires) {
      // Skip non-relative requires (built-ins and npm packages)
      if (!req.isRelative) {
        continue;
      }

      // Resolve the path
      const resolved = resolveRequirePath(req.raw, hookFile);

      if (resolved) {
        // Check if file exists
        const exists = fs.existsSync(resolved);
        req.resolved = resolved;
        req.exists = exists;

        if (!exists) {
          brokenRequires.push({
            raw: req.raw,
            resolved: path.relative(projectRoot, resolved).replace(/\\/g, '/'),
            line: req.line,
          });
        }
      } else {
        // Could not resolve (path traversal or error)
        brokenRequires.push({
          raw: req.raw,
          resolved: '(could not resolve)',
          line: req.line,
        });
      }
    }

    // Record result
    const result = {
      hook: hookRelative,
      passed: brokenRequires.length === 0 && errors.length === 0,
      brokenRequires,
      errors,
    };

    results.results.push(result);

    if (result.passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Cross-reference settings.json
  crossReferenceSettings(projectRoot, settingsPath, results);

  return results;
}

/**
 * Format human-readable report
 *
 * @param {Object} results - Results from verifyHooks()
 * @returns {string} Formatted report
 */
function formatHumanReport(results) {
  const lines = [];

  lines.push('Hook Module Verification');
  lines.push('========================');
  lines.push('');

  for (const result of results.results) {
    if (result.passed) {
      lines.push(`[PASS] ${result.hook}`);
    } else {
      lines.push(`[FAIL] ${result.hook}`);
      for (const broken of result.brokenRequires) {
        lines.push(`  -> ${broken.raw} (MISSING) [line ${broken.line}]`);
      }
      for (const error of result.errors) {
        lines.push(`  ERROR: ${error}`);
      }
    }
  }

  lines.push('');

  // Settings.json check
  if (results.settingsCheck.checked) {
    if (results.settingsCheck.error) {
      lines.push(`[ERROR] settings.json: ${results.settingsCheck.error}`);
    } else if (results.settingsCheck.missing.length > 0) {
      lines.push('[WARN] settings.json references missing hooks:');
      for (const missing of results.settingsCheck.missing) {
        lines.push(`  -> ${missing} (MISSING REGISTRATION)`);
      }
    }
  }

  lines.push(
    `Summary: ${results.passed} passed, ${results.failed} failed, ${results.passed + results.failed} total`
  );

  return lines.join('\n');
}

/**
 * Format JSON report
 *
 * @param {Object} results - Results from verifyHooks()
 * @returns {string} JSON string
 */
function formatJsonReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'static',
    hooksScanned: results.passed + results.failed,
    passed: results.passed,
    failed: results.failed,
    failures: results.results
      .filter(r => !r.passed)
      .map(r => ({
        hook: r.hook,
        brokenRequires: r.brokenRequires,
      })),
    settingsCheck: results.settingsCheck,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');

  const results = verifyHooks();

  if (jsonMode) {
    console.log(formatJsonReport(results));
  } else {
    console.log(formatHumanReport(results));
  }

  // Exit with appropriate code
  const exitCode = results.failed > 0 || results.settingsCheck.missing?.length > 0 ? 1 : 0;

  // Exit with error if settings.json has parse errors
  if (results.settingsCheck.error) {
    process.exit(1);
  }

  process.exit(exitCode);
}

// Export for testing
module.exports = { main, verifyHooks };

// Run if called directly
if (require.main === module) {
  main();
}
