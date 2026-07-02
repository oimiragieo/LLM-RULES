#!/usr/bin/env node
/**
 * Rule Index Path Validation Script
 *
 * Validates that all paths in rule-index.json exist on disk.
 * Prevents "link rot" in the rule index.
 * Also validates version compatibility.
 *
 * Usage:
 *   node scripts/validate-rule-index-paths.mjs
 *   node scripts/validate-rule-index-paths.mjs --fix  # Attempt to fix broken paths
 *   node scripts/validate-rule-index-paths.mjs --check-version  # Only validate version
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { resolveConfigPath } from '../../.claude/lib/utils/context-path-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

const RULE_INDEX_PATH = process.env.RULE_INDEX_PATH
  ? path.resolve(process.env.RULE_INDEX_PATH)
  : resolveConfigPath('rule-index.json', { read: true });
const _PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

// Expected rule index version (increment when index structure changes)
const EXPECTED_INDEX_VERSION = '1.1.0';

/**
 * Check if file exists
 */
async function _fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve path relative to project root
 */
function resolvePath(relativePath) {
  // Handle absolute paths
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }

  // Resolve relative to project root
  return path.join(ROOT, relativePath);
}

/**
 * Validate rule index version
 * @returns {Promise<{valid: boolean, current: string, expected: string, message: string}>}
 */
async function validateVersion() {
  try {
    const indexContent = await fs.readFile(RULE_INDEX_PATH, 'utf-8');
    const ruleIndex = JSON.parse(indexContent);

    const currentVersion = ruleIndex.version;

    if (!currentVersion) {
      return {
        valid: false,
        current: 'missing',
        expected: EXPECTED_INDEX_VERSION,
        message: 'Version field missing in rule-index.json',
      };
    }

    if (currentVersion !== EXPECTED_INDEX_VERSION) {
      return {
        valid: false,
        current: currentVersion,
        expected: EXPECTED_INDEX_VERSION,
        message: `Version mismatch (run 'pnpm index-rules' to update)`,
      };
    }

    return {
      valid: true,
      current: currentVersion,
      expected: EXPECTED_INDEX_VERSION,
      message: 'Version matches expected version',
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        valid: false,
        current: 'file-not-found',
        expected: EXPECTED_INDEX_VERSION,
        message: 'Rule index file not found',
      };
    }
    throw error;
  }
}

/**
 * Display version check results
 */
function displayVersionCheck(result, exitOnMismatch = true) {
  console.log('📋 Rule Index Version Check:');
  console.log(`   Current:  ${result.current}`);
  console.log(`   Expected: ${result.expected}`);

  if (result.valid) {
    console.log(`   Status:   ✅ UP-TO-DATE\n`);
    return 0;
  } else {
    const statusEmoji = result.current === 'file-not-found' ? '❌' : '⚠️';
    console.log(`   Status:   ${statusEmoji} ${result.message.toUpperCase()}\n`);

    if (exitOnMismatch) {
      return result.current === 'file-not-found' ? 2 : 1;
    }
    return 0;
  }
}

/**
 * Validate rule index paths
 */
async function validateRuleIndexPaths(fix = false, skipVersionCheck = false) {
  console.log('🔍 Validating rule index paths...\n');

  try {
    // Version check (unless skipped)
    if (!skipVersionCheck) {
      const versionResult = await validateVersion();
      const _exitCode = displayVersionCheck(versionResult, false);

      if (!versionResult.valid) {
        console.log('⚠️  Warning: Version check failed. Continuing with path validation...\n');
      }
    }

    // Read rule index
    const indexContent = await fs.readFile(RULE_INDEX_PATH, 'utf-8');
    const ruleIndex = JSON.parse(indexContent);

    if (!ruleIndex.rules || !Array.isArray(ruleIndex.rules)) {
      console.error('❌ Error: rule-index.json does not have a "rules" array');
      process.exit(1);
    }

    const brokenPaths = [];
    const validPaths = [];

    console.log(`Found ${ruleIndex.rules.length} rules in index\n`);

    // Validate each rule's path
    for (const rule of ruleIndex.rules) {
      if (!rule.path) {
        console.warn(`⚠️  Rule missing path: ${rule.name || rule.id || 'unknown'}`);
        brokenPaths.push({ rule, reason: 'Missing path field' });
        continue;
      }

      const resolvedPath = resolvePath(rule.path);
      const exists = existsSync(resolvedPath);

      if (exists) {
        validPaths.push(rule);
      } else {
        brokenPaths.push({ rule, reason: 'File does not exist', path: resolvedPath });
        console.error(`❌ Broken path: ${rule.path}`);
        console.error(`   Resolved to: ${resolvedPath}`);
        console.error(`   Rule: ${rule.name || rule.id || 'unknown'}\n`);
      }
    }

    // Report results
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Summary:`);
    console.log(`  ✅ Valid paths: ${validPaths.length}/${ruleIndex.rules.length}`);
    console.log(`  ❌ Broken paths: ${brokenPaths.length}/${ruleIndex.rules.length}`);
    console.log(`${'='.repeat(60)}\n`);

    if (brokenPaths.length > 0) {
      console.log('Broken paths:');
      brokenPaths.forEach(({ rule, reason, path: brokenPath }) => {
        console.log(`  - ${rule.name || rule.id || 'unknown'}: ${reason}`);
        if (brokenPath) {
          console.log(`    Path: ${brokenPath}`);
        }
      });
      console.log('');

      if (fix) {
        console.log('💡 --fix flag provided, but automatic fixing is not implemented.');
        console.log('   Please manually update rule-index.json with correct paths.\n');
      }

      process.exit(1);
    } else {
      console.log('✅ All rule index paths are valid!\n');
      process.exit(0);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Rule index file not found at ${RULE_INDEX_PATH}`);
      console.error('   Please ensure the rule index exists.');
    } else if (error instanceof SyntaxError) {
      console.error(`❌ Error: Invalid JSON in rule index: ${error.message}`);
    } else {
      console.error(`❌ Error during validation: ${error.message}`);
    }
    process.exit(1);
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/validate-rule-index-paths.mjs [options]');
  console.log('');
  console.log('Validates that all paths in rule-index.json exist on disk.');
  console.log('Prevents "link rot" in the rule index and validates version compatibility.');
  console.log('');
  console.log('Options:');
  console.log('  --fix              Attempt to fix broken paths (not yet implemented)');
  console.log('  --check-version    Only validate version (skip path validation)');
  console.log('  --skip-version     Skip version check (only validate paths)');
  console.log('  -h, --help         Show this help message');
  console.log('');
  console.log('Exit codes:');
  console.log('  0 - All validations passed');
  console.log('  1 - Version mismatch (warning) or broken paths found');
  console.log('  2 - Version file missing (error)');
  process.exit(0);
}

const fix = args.includes('--fix');
const checkVersionOnly = args.includes('--check-version');
const skipVersionCheck = args.includes('--skip-version');

// If only checking version
if (checkVersionOnly) {
  validateVersion()
    .then(result => {
      const exitCode = displayVersionCheck(result, true);
      process.exit(exitCode);
    })
    .catch(error => {
      console.error(`❌ Error during version check: ${error.message}`);
      process.exit(2);
    });
} else {
  // Full validation (paths + version)
  validateRuleIndexPaths(fix, skipVersionCheck);
}
