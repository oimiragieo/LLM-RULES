#!/usr/bin/env node
/**
 * Workflow Test Runner
 * ====================
 *
 * Runs all tests for the executable workflow ecosystem.
 * Supports running individual test suites or all tests.
 *
 * Usage:
 *   node run-workflow-tests.cjs           # Run all tests
 *   node run-workflow-tests.cjs --cli     # Run CLI tests only
 *   node run-workflow-tests.cjs --validator  # Run validator tests only
 *   node run-workflow-tests.cjs --integration  # Run integration tests only
 *   node run-workflow-tests.cjs --help    # Show help
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKFLOW_DIR = __dirname;

const TEST_SUITES = {
  cli: {
    name: 'Workflow CLI',
    file: 'workflow-cli.test.cjs',
    description: 'Tests for the workflow CLI tool',
  },
  validator: {
    name: 'Workflow Validator',
    file: 'workflow-validator.test.cjs',
    description: 'Tests for the workflow YAML validator',
  },
  integration: {
    name: 'Workflow Integration',
    file: 'workflow-integration.test.cjs',
    description: 'Comprehensive integration tests for the entire ecosystem',
  },
};

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(args) {
  const result = {
    suites: [],
    help: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--cli') {
      result.suites.push('cli');
    } else if (arg === '--validator') {
      result.suites.push('validator');
    } else if (arg === '--integration') {
      result.suites.push('integration');
    } else if (arg === '--all') {
      result.suites = Object.keys(TEST_SUITES);
    }
  }

  // Default to all suites if none specified
  if (result.suites.length === 0 && !result.help) {
    result.suites = Object.keys(TEST_SUITES);
  }

  return result;
}

// =============================================================================
// Help Output
// =============================================================================

function printHelp() {
  console.log(`
Workflow Test Runner
====================

Runs all tests for the executable workflow ecosystem.

Usage:
  node run-workflow-tests.cjs [options]

Options:
  --cli           Run CLI tests only
  --validator     Run validator tests only
  --integration   Run integration tests only
  --all           Run all test suites (default)
  --verbose, -v   Show verbose output
  --help, -h      Show this help message

Test Suites:
`);

  for (const [key, suite] of Object.entries(TEST_SUITES)) {
    // SEC-FALSE-POSITIVE: This logs test suite names, not sensitive data
    console.log(`  --${key.padEnd(15)} ${suite.description}`);
  }

  console.log(`
Examples:
  node run-workflow-tests.cjs                    # Run all tests
  node run-workflow-tests.cjs --cli              # Run CLI tests only
  node run-workflow-tests.cjs --cli --validator  # Run CLI and validator tests
`);
}

// =============================================================================
// Test Runner
// =============================================================================

function runTestSuite(suiteKey, verbose = false) {
  const suite = TEST_SUITES[suiteKey];
  if (!suite) {
    console.error(`Unknown test suite: ${suiteKey}`);
    return { passed: false, error: 'Unknown suite' };
  }

  const testFile = path.join(WORKFLOW_DIR, suite.file);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${suite.name}`);
  console.log(`File: ${suite.file}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // SEC-FIX: Use spawnSync with array args instead of string interpolation (prevents command injection)
    const result = spawnSync(process.execPath, [testFile], {
      encoding: 'utf-8',
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: PROJECT_ROOT,
      windowsHide: true,
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'Tests failed');
    }

    const output = result.stdout || '';

    if (!verbose) {
      // Extract summary from output
      const lines = output.split('\n');
      const summaryLine = lines.find(line => line.includes('Results:'));
      if (summaryLine) {
        console.log(summaryLine);
      } else {
        console.log('Tests completed successfully');
      }
    }

    return { passed: true, output };
  } catch (e) {
    console.error(`Tests failed for ${suite.name}`);
    if (e.stdout) {
      console.log(e.stdout);
    }
    if (e.stderr) {
      console.error(e.stderr);
    }
    return { passed: false, error: e.message };
  }
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('Workflow Ecosystem Test Runner');
  console.log('==============================\n');
  console.log(`Running ${args.suites.length} test suite(s): ${args.suites.join(', ')}`);

  const results = {};
  let allPassed = true;

  for (const suiteKey of args.suites) {
    results[suiteKey] = runTestSuite(suiteKey, args.verbose);
    if (!results[suiteKey].passed) {
      allPassed = false;
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  for (const [suiteKey, result] of Object.entries(results)) {
    const suite = TEST_SUITES[suiteKey];
    const status = result.passed ? 'PASS' : 'FAIL';
    const icon = result.passed ? '[OK]' : '[X]';
    console.log(`${icon} ${suite.name}: ${status}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(allPassed ? 0 : 1);
}

main();
