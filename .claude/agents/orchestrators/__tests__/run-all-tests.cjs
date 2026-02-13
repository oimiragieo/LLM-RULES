#!/usr/bin/env node
/**
 * Orchestrator Integration Test Runner
 * =====================================
 *
 * Runs all orchestrator integration tests and reports results.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const testFiles = [
  path.join(__dirname, 'integration', 'master-orchestrator.test.cjs'),
  path.join(__dirname, 'integration', 'swarm-coordinator.test.cjs'),
  path.join(__dirname, 'integration', 'evolution-orchestrator.test.cjs'),
];

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║       Orchestrator Integration Tests - Test Runner            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;
let currentFile = 0; // eslint-disable-line no-unused-vars

function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Running: ${path.basename(testFile)}`);
    console.log('─'.repeat(70));

    const proc = spawn('node', [testFile], {
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', data => {
      output += data.toString();
    });

    proc.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    proc.on('close', code => {
      // Parse TAP output to get test counts
      const testMatch = output.match(/# tests (\d+)/);
      const passMatch = output.match(/# pass (\d+)/);
      const failMatch = output.match(/# fail (\d+)/);

      const tests = testMatch ? parseInt(testMatch[1]) : 0;
      const pass = passMatch ? parseInt(passMatch[1]) : 0;
      const fail = failMatch ? parseInt(failMatch[1]) : 0;

      totalTests += tests;
      totalPassed += pass;
      totalFailed += fail;

      if (code === 0) {
        console.log(`✓ PASSED: ${pass}/${tests} tests`);
      } else {
        console.log(`✗ FAILED: ${fail}/${tests} tests failed`);
        if (errorOutput) {
          console.log('\nError Output:');
          console.log(errorOutput);
        }
      }

      resolve(code === 0);
    });

    proc.on('error', err => {
      console.error(`✗ ERROR running test: ${err.message}`);
      reject(err);
    });
  });
}

async function runAllTests() {
  const startTime = Date.now();

  for (const testFile of testFiles) {
    try {
      await runTest(testFile);
      currentFile++;
    } catch (err) {
      console.error(`Failed to run ${testFile}:`, err);
      totalFailed++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '═'.repeat(70));
  console.log('                       FINAL RESULTS');
  console.log('═'.repeat(70));
  console.log(`Total Tests:    ${totalTests}`);
  console.log(`Passed:         ${totalPassed} ✓`);
  console.log(`Failed:         ${totalFailed} ✗`);
  console.log(`Duration:       ${duration}s`);
  console.log(`Success Rate:   ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  console.log('═'.repeat(70));

  if (totalFailed > 0) {
    console.log('\n⚠ Some tests failed. Review output above for details.\n');
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
