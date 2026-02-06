#!/usr/bin/env node
/**
 * Test script for version validation
 *
 * This script tests various version mismatch scenarios
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

import { resolveConfigPath } from '../../.claude/tools/context/context-path-resolver.mjs';
const RULE_INDEX_PATH = resolveConfigPath('rule-index.json', { read: true });
const BACKUP_PATH = path.join(ROOT, '.claude/context/rule-index.backup.json');

/**
 * Run validation script and capture output
 */
function runValidation(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/validate-rule-index-paths.mjs', ...args], {
      cwd: ROOT,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Test scenario: Version matches
 */
async function testVersionMatches() {
  console.log('Test 1: Version matches (current: 1.1.0, expected: 1.1.0)');
  const result = await runValidation(['--check-version']);

  console.log(result.stdout);

  if (result.code === 0 && result.stdout.includes('UP-TO-DATE')) {
    console.log('✅ Test passed\n');
    return true;
  } else {
    console.log(`❌ Test failed (exit code: ${result.code})\n`);
    return false;
  }
}

/**
 * Test scenario: Version mismatch
 */
async function testVersionMismatch() {
  console.log('Test 2: Version mismatch (simulated)');

  // Backup original index
  const originalContent = await fs.readFile(RULE_INDEX_PATH, 'utf-8');
  await fs.writeFile(BACKUP_PATH, originalContent);

  try {
    // Modify version to create mismatch
    const ruleIndex = JSON.parse(originalContent);
    ruleIndex.version = '1.0.0';
    await fs.writeFile(RULE_INDEX_PATH, JSON.stringify(ruleIndex, null, 2));

    const result = await runValidation(['--check-version']);

    console.log(result.stdout);

    if (result.code === 1 && result.stdout.includes('VERSION MISMATCH')) {
      console.log('✅ Test passed\n');
      return true;
    } else {
      console.log(`❌ Test failed (exit code: ${result.code})\n`);
      return false;
    }
  } finally {
    // Restore original index
    await fs.writeFile(RULE_INDEX_PATH, originalContent);
    await fs.unlink(BACKUP_PATH);
  }
}

/**
 * Test scenario: Missing version field
 */
async function testMissingVersion() {
  console.log('Test 3: Missing version field');

  // Backup original index
  const originalContent = await fs.readFile(RULE_INDEX_PATH, 'utf-8');
  await fs.writeFile(BACKUP_PATH, originalContent);

  try {
    // Remove version field
    const ruleIndex = JSON.parse(originalContent);
    delete ruleIndex.version;
    await fs.writeFile(RULE_INDEX_PATH, JSON.stringify(ruleIndex, null, 2));

    const result = await runValidation(['--check-version']);

    console.log(result.stdout);

    if (result.code === 1 && result.stdout.includes('VERSION FIELD MISSING')) {
      console.log('✅ Test passed\n');
      return true;
    } else {
      console.log(`❌ Test failed (exit code: ${result.code})\n`);
      return false;
    }
  } finally {
    // Restore original index
    await fs.writeFile(RULE_INDEX_PATH, originalContent);
    await fs.unlink(BACKUP_PATH);
  }
}

/**
 * Test scenario: Full validation (version + paths)
 */
async function testFullValidation() {
  console.log('Test 4: Full validation (version + paths)');
  const result = await runValidation();

  console.log(result.stdout);

  if (
    result.code === 0 &&
    result.stdout.includes('UP-TO-DATE') &&
    result.stdout.includes('Valid paths')
  ) {
    console.log('✅ Test passed\n');
    return true;
  } else {
    console.log(`❌ Test failed (exit code: ${result.code})\n`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Running version validation tests...\n');
  console.log('='.repeat(60));

  const results = [];

  results.push(await testVersionMatches());
  results.push(await testVersionMismatch());
  results.push(await testMissingVersion());
  results.push(await testFullValidation());

  console.log('='.repeat(60));
  console.log('\nTest Results:');
  console.log(`  Passed: ${results.filter(r => r).length}/${results.length}`);
  console.log(`  Failed: ${results.filter(r => !r).length}/${results.length}`);

  if (results.every(r => r)) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});
