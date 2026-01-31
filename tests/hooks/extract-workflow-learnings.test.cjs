#!/usr/bin/env node
/**
 * Workflow Learning Extraction Hook - Test Suite
 *
 * Tests the automatic extraction and recording of learnings
 * from completed workflows.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, 'extract-workflow-learnings.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LEARNINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');

// Test utilities
let testsFailed = 0;
let testsPass = 0;
let originalLearningsContent = '';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    testsFailed++;
    return false;
  }
  console.log(`PASS: ${message}`);
  testsPass++;
  return true;
}

/**
 * Backup learnings file before tests
 */
function backupLearnings() {
  try {
    if (fs.existsSync(LEARNINGS_PATH)) {
      originalLearningsContent = fs.readFileSync(LEARNINGS_PATH, 'utf-8');
    }
  } catch (_e) {
    originalLearningsContent = '';
  }
}

/**
 * Restore learnings file after tests
 */
function restoreLearnings() {
  try {
    if (originalLearningsContent) {
      fs.writeFileSync(LEARNINGS_PATH, originalLearningsContent);
    }
  } catch (_e) {
    console.error('Warning: Could not restore learnings file');
  }
}

/**
 * Run the hook with given context
 */
async function _runHook(context) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [HOOK_PATH, JSON.stringify(context)], {
      cwd: PROJECT_ROOT,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', c => {
      stdout += c;
    });
    proc.stderr.on('data', c => {
      stderr += c;
    });
    proc.on('error', e => reject(e));
    proc.on('close', code => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    setTimeout(() => proc.kill('SIGTERM'), 5000);
  });
}

/**
 * Test the module exports directly
 */
function testModuleExports() {
  console.log('\nTest 1: Module exports');

  // This will fail until we create the hook
  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  assert(typeof hook.validate === 'function', 'Should export validate function');
  assert(
    typeof hook.isWorkflowComplete === 'function',
    'Should export isWorkflowComplete function'
  );
  assert(typeof hook.extractLearnings === 'function', 'Should export extractLearnings function');
  assert(typeof hook.appendLearnings === 'function', 'Should export appendLearnings function');
  assert(Array.isArray(hook.WORKFLOW_COMPLETE_MARKERS), 'Should export WORKFLOW_COMPLETE_MARKERS');
  assert(Array.isArray(hook.LEARNING_PATTERNS), 'Should export LEARNING_PATTERNS');
}

/**
 * Test workflow completion detection
 */
function testWorkflowCompletionDetection() {
  console.log('\nTest 2: Workflow completion detection');

  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  // Should detect completion markers
  assert(
    hook.isWorkflowComplete('The workflow complete successfully'),
    'Should detect "workflow complete"'
  );
  assert(
    hook.isWorkflowComplete('All phases complete. Ready for review.'),
    'Should detect "all phases complete"'
  );
  assert(
    hook.isWorkflowComplete('All tasks completed and verified.'),
    'Should detect "all tasks completed"'
  );
  assert(
    hook.isWorkflowComplete('Implementation complete and tests passing.'),
    'Should detect "implementation complete"'
  );

  // Should not detect partial matches
  assert(!hook.isWorkflowComplete('Starting the workflow now'), 'Should not detect workflow start');
  assert(!hook.isWorkflowComplete('Just fixing a bug'), 'Should not detect random text');
}

/**
 * Test learning extraction patterns
 */
function testLearningExtraction() {
  console.log('\nTest 3: Learning extraction patterns');

  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  // Test various learning patterns
  const text1 = 'Learned: Always run tests before committing code.';
  const learnings1 = hook.extractLearnings(text1);
  assert(learnings1.length > 0, 'Should extract "learned:" pattern');
  assert(
    learnings1.some(l => l.includes('run tests')),
    'Should extract learning content'
  );

  const text2 = 'Discovered: The API requires authentication headers.';
  const learnings2 = hook.extractLearnings(text2);
  assert(learnings2.length > 0, 'Should extract "discovered:" pattern');

  const text3 = 'Best practice: Use dependency injection for testability.';
  const learnings3 = hook.extractLearnings(text3);
  assert(learnings3.length > 0, 'Should extract "best practice:" pattern');

  const text4 = 'Pattern: Repository pattern for data access.';
  const learnings4 = hook.extractLearnings(text4);
  assert(learnings4.length > 0, 'Should extract "pattern:" pattern');

  // Test filtering short learnings
  const shortText = 'Learned: abc';
  const shortLearnings = hook.extractLearnings(shortText);
  assert(shortLearnings.length === 0, 'Should filter out short learnings (<10 chars)');

  // Test deduplication
  const duplicateText = 'Learned: Same thing. Learned: Same thing.';
  const dedupedLearnings = hook.extractLearnings(duplicateText);
  assert(dedupedLearnings.length <= 1, 'Should deduplicate learnings');
}

/**
 * Test the validate function with non-Task tools
 */
function testValidateNonTaskTool() {
  console.log('\nTest 4: Validate non-Task tool (should pass through)');

  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  const context = {
    tool: 'Read',
    result: { output: 'Some file content' },
  };

  const result = hook.validate(context);
  assert(result.valid === true, 'Should return valid for non-Task tools');
  assert(result.error === '', 'Should have empty error');
}

/**
 * Test the validate function with Task tool but no completion
 */
function testValidateTaskNoCompletion() {
  console.log('\nTest 5: Validate Task tool without workflow completion');

  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  const context = {
    tool: 'Task',
    result: { output: 'Task started. Working on implementation...' },
    parameters: { description: 'Test workflow' },
  };

  const result = hook.validate(context);
  assert(result.valid === true, 'Should return valid when no completion detected');
  assert(result.error === '', 'Should have empty error');
}

/**
 * Test the validate function with Task tool and workflow completion
 */
function testValidateTaskWithCompletion() {
  console.log('\nTest 6: Validate Task tool with workflow completion and learnings');

  let hook;
  try {
    hook = require(HOOK_PATH);
  } catch (e) {
    assert(false, `Hook should be loadable: ${e.message}`);
    return;
  }

  const context = {
    tool: 'Task',
    result: {
      output:
        'Workflow completed successfully.\nLearned: Always validate input before processing.\nPattern: Use early returns for error handling.',
    },
    parameters: { description: 'Test Workflow Run' },
  };

  // Get current learnings content to check after
  const beforeContent = fs.existsSync(LEARNINGS_PATH)
    ? fs.readFileSync(LEARNINGS_PATH, 'utf-8')
    : '';

  const result = hook.validate(context);
  assert(result.valid === true, 'Should return valid');
  assert(result.error === '', 'Should have empty error');

  // Check if learnings were appended
  const afterContent = fs.existsSync(LEARNINGS_PATH)
    ? fs.readFileSync(LEARNINGS_PATH, 'utf-8')
    : '';

  assert(afterContent.length > beforeContent.length, 'Should append learnings to file');
  assert(afterContent.includes('Auto-Extracted'), 'Should include auto-extracted marker');
  assert(afterContent.includes('Test Workflow Run'), 'Should include workflow name');
}

/**
 * Run the hook file directly with --check
 */
async function testSyntaxCheck() {
  console.log('\nTest 7: Syntax check via node --check');

  const { code, stderr } = await new Promise((resolve, reject) => {
    const proc = spawn('node', ['--check', HOOK_PATH], {
      cwd: PROJECT_ROOT,
    });

    let stderr = '';
    proc.stderr.on('data', c => {
      stderr += c;
    });
    proc.on('error', e => reject(e));
    proc.on('close', code => {
      resolve({ code, stderr: stderr.trim() });
    });

    setTimeout(() => proc.kill('SIGTERM'), 5000);
  });

  assert(code === 0, `Should pass syntax check (exit code: ${code}, stderr: ${stderr})`);
}

// Run all tests
async function runAllTests() {
  console.log('Workflow Learning Extraction Hook - Test Suite\n');
  console.log('='.repeat(70));

  backupLearnings();

  try {
    await testSyntaxCheck();
    testModuleExports();
    testWorkflowCompletionDetection();
    testLearningExtraction();
    testValidateNonTaskTool();
    testValidateTaskNoCompletion();
    testValidateTaskWithCompletion();
  } catch (error) {
    console.error(`\nTest execution failed: ${error.message}`);
    console.error(error.stack);
    testsFailed++;
  } finally {
    restoreLearnings();
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\nTest Results: ${testsPass} passed, ${testsFailed} failed`);

  if (testsFailed > 0) {
    console.log('\nSome tests failed!');
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

runAllTests();
