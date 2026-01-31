#!/usr/bin/env node
/**
 * Router Write Guard Hook - Test Suite
 *
 * Tests the router write guard enforcement including:
 * - Router context blocks Edit/Write tools
 * - Agent context allows Edit/Write tools
 * - Enforcement modes (block, warn, off)
 * - Always-allowed file patterns (runtime, memory, .gitkeep)
 * - Environment variable overrides
 * - Security override audit logging
 * - Message formatting
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// HOOK-002 FIX: Use shared project-root utility instead of duplicated function
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'router-write-guard.cjs');
const STATE_MODULE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'router-state.cjs'
);
const STATE_FILE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'router-state.json'
);

// Test utilities
let testsFailed = 0;
let testsPass = 0;
let currentTestName = '';

function assert(condition, message) {
  const fullMessage = currentTestName ? `[${currentTestName}] ${message}` : message;
  if (!condition) {
    console.error(`FAIL: ${fullMessage}`);
    testsFailed++;
    return false;
  }
  console.log(`PASS: ${fullMessage}`);
  testsPass++;
  return true;
}

/**
 * Clean up state file before/after tests
 */
function cleanupState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      fs.unlinkSync(STATE_FILE_PATH);
    }
  } catch (_e) {
    // Ignore cleanup errors
  }
}

/**
 * Clear module cache
 */
function clearModuleCache() {
  delete require.cache[require.resolve(STATE_MODULE_PATH)];
}

/**
 * Run the hook with given input and environment
 * @param {Object} hookInput - The hook input JSON
 * @param {Object} env - Additional environment variables
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runHook(hookInput, env = {}) {
  const result = spawnSync('node', [HOOK_PATH, JSON.stringify(hookInput)], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf-8',
    timeout: 5000,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Set router state for testing
 * @param {Object} stateOverrides - State fields to override
 */
function setRouterState(stateOverrides) {
  clearModuleCache();
  const mod = require(STATE_MODULE_PATH);

  // Reset to known state
  mod.resetToRouterMode();

  // Apply overrides
  if (stateOverrides.mode === 'agent') {
    mod.enterAgentMode(stateOverrides.taskDescription || 'Test task');
  }

  return mod;
}

// =============================================================================
// Test 1: Hook blocks Edit in router context (block mode, exit 2 per HOOK-005)
// =============================================================================
function testBlocksEditInRouterContext() {
  currentTestName = 'Blocks Edit in router context';
  console.log(`\nTest 1: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 2, 'Should exit with code 2 (blocked per HOOK-005)');
  assert(result.stdout.includes('ROUTER WRITE BLOCKED'), 'Should show blocked message');
  assert(result.stdout.includes('Edit'), 'Should mention the tool name');
}

// =============================================================================
// Test 2: Hook blocks Write in router context (block mode)
// =============================================================================
function testBlocksWriteInRouterContext() {
  currentTestName = 'Blocks Write in router context';
  console.log(`\nTest 2: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 2, 'Should exit with code 2 (blocked per HOOK-005)');
  assert(result.stdout.includes('ROUTER WRITE BLOCKED'), 'Should show blocked message');
  assert(result.stdout.includes('Write'), 'Should mention the tool name');
}

// =============================================================================
// Test 3: Hook allows Edit in agent context
// =============================================================================
function testAllowsEditInAgentContext() {
  currentTestName = 'Allows Edit in agent context';
  console.log(`\nTest 3: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set agent mode (task spawned)
  setRouterState({ mode: 'agent', taskDescription: 'Developer fixing bug' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 4: Hook allows Write in agent context
// =============================================================================
function testAllowsWriteInAgentContext() {
  currentTestName = 'Allows Write in agent context';
  console.log(`\nTest 4: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set agent mode (task spawned)
  setRouterState({ mode: 'agent', taskDescription: 'Developer writing code' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 5: Warn mode shows warning but allows write
// =============================================================================
function testWarnModeShowsWarning() {
  currentTestName = 'Warn mode shows warning';
  console.log(`\nTest 5: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'warn' });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed in warn mode)');
  assert(result.stdout.includes('ROUTER WRITE WARNING'), 'Should show warning message');
  assert(result.stdout.includes('Consider using Task tool'), 'Should suggest using Task tool');
}

// =============================================================================
// Test 6: Off mode disables enforcement and logs security override
// =============================================================================
function testOffModeDisablesEnforcement() {
  currentTestName = 'Off mode disables enforcement';
  console.log(`\nTest 6: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'off' });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed in off mode)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
  assert(!result.stdout.includes('WARNING'), 'Should not show warning message');

  // Check for security override audit log
  assert(result.stderr.includes('security_override_used'), 'Should log security override usage');
  assert(result.stderr.includes('ROUTER_WRITE_GUARD=off'), 'Should log the override type');
}

// =============================================================================
// Test 7: ALLOW_ROUTER_WRITE override allows write
// =============================================================================
function testAllowRouterWriteOverride() {
  currentTestName = 'ALLOW_ROUTER_WRITE override';
  console.log(`\nTest 7: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, {
    ROUTER_WRITE_GUARD: 'block',
    ALLOW_ROUTER_WRITE: 'true',
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed with override)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 8: Always-allowed patterns - runtime directory
// =============================================================================
function testAlwaysAllowedRuntimeDirectory() {
  currentTestName = 'Always allowed - runtime directory';
  console.log(`\nTest 8: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'some-state.json'),
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (runtime dir is always allowed)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 9: Always-allowed patterns - memory directory
// =============================================================================
function testAlwaysAllowedMemoryDirectory() {
  currentTestName = 'Always allowed - memory directory';
  console.log(`\nTest 9: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md'),
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (memory dir is always allowed)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 10: Always-allowed patterns - .gitkeep files
// =============================================================================
function testAlwaysAllowedGitkeep() {
  currentTestName = 'Always allowed - .gitkeep files';
  console.log(`\nTest 10: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: '/some/path/.gitkeep',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (.gitkeep is always allowed)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 11: Non-write tools are ignored
// =============================================================================
function testNonWriteToolsIgnored() {
  currentTestName = 'Non-write tools ignored';
  console.log(`\nTest 11: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Read',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should exit with code 0 (Read tool ignored)');
  assert(!result.stdout.includes('BLOCKED'), 'Should not show blocked message');
}

// =============================================================================
// Test 12: NotebookEdit tool is blocked
// =============================================================================
function testNotebookEditBlocked() {
  currentTestName = 'NotebookEdit tool blocked';
  console.log(`\nTest 12: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode (no agent spawned)
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'NotebookEdit',
    tool_input: {
      notebook_path: '/some/path/notebook.ipynb',
    },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 2, 'Should exit with code 2 (blocked per HOOK-005)');
  assert(result.stdout.includes('ROUTER WRITE BLOCKED'), 'Should show blocked message');
  assert(result.stdout.includes('NotebookEdit'), 'Should mention the tool name');
}

// =============================================================================
// Test 13: Empty/null hook input is handled gracefully
// =============================================================================
function testEmptyHookInput() {
  currentTestName = 'Empty hook input handled';
  console.log(`\nTest 13: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Run without any JSON argument
  const result = spawnSync('node', [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ROUTER_WRITE_GUARD: 'block' },
    encoding: 'utf-8',
    timeout: 5000,
  });

  assert(result.status === 0, 'Should exit with code 0 (no input = no blocking)');
}

// =============================================================================
// Test 14: Invalid JSON is handled gracefully
// =============================================================================
function testInvalidJsonHandled() {
  currentTestName = 'Invalid JSON handled';
  console.log(`\nTest 14: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Run with invalid JSON
  const result = spawnSync('node', [HOOK_PATH, 'not-valid-json'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ROUTER_WRITE_GUARD: 'block' },
    encoding: 'utf-8',
    timeout: 5000,
  });

  assert(result.status === 0, 'Should exit with code 0 (invalid JSON = no blocking)');
}

// =============================================================================
// Test 15: ROUTER_DEBUG shows debug output
// =============================================================================
function testDebugMode() {
  currentTestName = 'Debug mode shows output';
  console.log(`\nTest 15: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set agent mode (task spawned)
  setRouterState({ mode: 'agent', taskDescription: 'Developer fixing bug' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/path/file.ts',
    },
  };

  const result = runHook(hookInput, {
    ROUTER_WRITE_GUARD: 'block',
    ROUTER_DEBUG: 'true',
  });

  assert(result.exitCode === 0, 'Should exit with code 0 (allowed)');
  assert(result.stdout.includes('[router-write-guard]'), 'Should show debug output');
  assert(result.stdout.includes('Allowed'), 'Should show reason for allowing');
}

// =============================================================================
// Test 16: File path extraction from different input formats
// =============================================================================
function testFilePathExtraction() {
  currentTestName = 'File path extraction';
  console.log(`\nTest 16: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode
  setRouterState({ mode: 'router' });

  // Test file_path format
  let hookInput = {
    tool_name: 'Write',
    tool_input: { file_path: '/test/file.ts' },
  };
  let result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });
  assert(result.exitCode === 2, 'Should block with file_path format');

  // Test filePath format (camelCase)
  hookInput = {
    tool_name: 'Write',
    tool_input: { filePath: '/test/file.ts' },
  };
  result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });
  assert(result.exitCode === 2, 'Should block with filePath format');

  // Test path format
  hookInput = {
    tool_name: 'Write',
    tool_input: { path: '/test/file.ts' },
  };
  result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });
  assert(result.exitCode === 2, 'Should block with path format');

  // Test notebook_path format
  hookInput = {
    tool_name: 'NotebookEdit',
    tool_input: { notebook_path: '/test/notebook.ipynb' },
  };
  result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });
  assert(result.exitCode === 2, 'Should block with notebook_path format');
}

// =============================================================================
// Test 17: Blocked message contains escape hatch instructions
// =============================================================================
function testBlockedMessageContainsEscapeHatches() {
  currentTestName = 'Blocked message has escape hatches';
  console.log(`\nTest 17: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Edit',
    tool_input: { file_path: '/test/file.ts' },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 2, 'Should be blocked (exit 2 per HOOK-005)');
  // SEC-AUDIT-021: Override hints removed from user-facing error messages
  // assert(result.stdout.includes('ROUTER_WRITE_GUARD=warn'), 'Should mention warn escape hatch');
  // assert(result.stdout.includes('ROUTER_WRITE_GUARD=off'), 'Should mention off escape hatch');
  // assert(result.stdout.includes('ALLOW_ROUTER_WRITE=true'), 'Should mention one-time override');
  assert(
    result.stdout.includes('Task tool') || result.stdout.includes('Task'),
    'Should mention Task tool as solution'
  );
}

// =============================================================================
// Test 18: Warning message suggests appropriate agents
// =============================================================================
function testWarningMessageSuggestsAgents() {
  currentTestName = 'Warning message suggests agents';
  console.log(`\nTest 18: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool_name: 'Write',
    tool_input: { file_path: '/test/file.ts' },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'warn' });

  assert(result.exitCode === 0, 'Should be allowed in warn mode');
  assert(result.stdout.includes('developer'), 'Should suggest developer agent');
  assert(result.stdout.includes('planner'), 'Should suggest planner agent');
  assert(result.stdout.includes('technical-writer'), 'Should suggest technical-writer agent');
}

// =============================================================================
// Test 19: Alternative tool_input format (input instead of tool_input)
// =============================================================================
function testAlternativeInputFormat() {
  currentTestName = 'Alternative input format';
  console.log(`\nTest 19: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode
  setRouterState({ mode: 'router' });

  const hookInput = {
    tool: 'Write',
    input: { file_path: '/test/file.ts' },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 2, 'Should block with alternative format');
  assert(result.stdout.includes('ROUTER WRITE BLOCKED'), 'Should show blocked message');
}

// =============================================================================
// Test 20: Windows path normalization
// =============================================================================
function testWindowsPathNormalization() {
  currentTestName = 'Windows path normalization';
  console.log(`\nTest 20: ${currentTestName}`);

  cleanupState();
  clearModuleCache();

  // Set router mode
  setRouterState({ mode: 'router' });

  // Test Windows-style path to always-allowed directory
  const windowsPath = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'test.md');

  const hookInput = {
    tool_name: 'Write',
    tool_input: { file_path: windowsPath },
  };

  const result = runHook(hookInput, { ROUTER_WRITE_GUARD: 'block' });

  assert(result.exitCode === 0, 'Should allow Windows-style path to memory directory');
}

// Run all tests
function runAllTests() {
  console.log('Router Write Guard Hook - Test Suite');
  console.log('='.repeat(70));

  cleanupState();

  try {
    testBlocksEditInRouterContext();
    testBlocksWriteInRouterContext();
    testAllowsEditInAgentContext();
    testAllowsWriteInAgentContext();
    testWarnModeShowsWarning();
    testOffModeDisablesEnforcement();
    testAllowRouterWriteOverride();
    testAlwaysAllowedRuntimeDirectory();
    testAlwaysAllowedMemoryDirectory();
    testAlwaysAllowedGitkeep();
    testNonWriteToolsIgnored();
    testNotebookEditBlocked();
    testEmptyHookInput();
    testInvalidJsonHandled();
    testDebugMode();
    testFilePathExtraction();
    testBlockedMessageContainsEscapeHatches();
    testWarningMessageSuggestsAgents();
    testAlternativeInputFormat();
    testWindowsPathNormalization();
  } catch (error) {
    console.error(`\nTest execution failed: ${error.message}`);
    console.error(error.stack);
    testsFailed++;
  } finally {
    cleanupState();
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
