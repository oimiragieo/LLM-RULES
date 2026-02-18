#!/usr/bin/env node
/**
 * Workflow CLI Tests
 * ==================
 *
 * Tests for the workflow CLI tool.
 * Follows TDD - these tests were written FIRST.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { _execSync } = require('child_process');

// Test framework
const tests = [];
let passed = 0;
let failed = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✓ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${test.name}`);
      console.log(`    Error: ${e.message}`);
      failed++;
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const _CLI_PATH = path.join(__dirname, 'workflow-cli.cjs');
const _TEST_WORKFLOW_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'workflows',
  'creators',
  'agent-creator-workflow.yaml'
);
const TEST_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'test-cli-temp');

// Cleanup function
function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('WorkflowCLI Module', () => {
  it('should export WorkflowCLI class', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    assert(WorkflowCLI, 'WorkflowCLI should be exported');
    assert(typeof WorkflowCLI === 'function', 'WorkflowCLI should be a class');
  });

  it('should export parseArgs function', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    assert(parseArgs, 'parseArgs should be exported');
    assert(typeof parseArgs === 'function', 'parseArgs should be a function');
  });

  it('should export COMMANDS constant', () => {
    const { COMMANDS } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    assert(COMMANDS, 'COMMANDS should be exported');
    assert(COMMANDS.CREATE, 'COMMANDS.CREATE should exist');
    assert(COMMANDS.UPDATE, 'COMMANDS.UPDATE should exist');
    assert(COMMANDS.RESUME, 'COMMANDS.RESUME should exist');
    assert(COMMANDS.LIST, 'COMMANDS.LIST should exist');
    assert(COMMANDS.STATUS, 'COMMANDS.STATUS should exist');
    assert(COMMANDS.ROLLBACK, 'COMMANDS.ROLLBACK should exist');
  });
});

describe('parseArgs', () => {
  it('should parse create command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['create', 'agent', '--name', 'my-agent', '--type', 'domain']);
    assertEqual(args.command, 'create');
    assertEqual(args.workflowType, 'agent');
    assertEqual(args.options.name, 'my-agent');
    assertEqual(args.options.type, 'domain');
  });

  it('should parse update command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['update', 'skill', '--name', 'tdd', '--changes', 'add pattern']);
    assertEqual(args.command, 'update');
    assertEqual(args.workflowType, 'skill');
    assertEqual(args.options.name, 'tdd');
    assertEqual(args.options.changes, 'add pattern');
  });

  it('should parse resume command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['resume', 'chk-123456']);
    assertEqual(args.command, 'resume');
    assertEqual(args.checkpointId, 'chk-123456');
  });

  it('should parse list command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['list']);
    assertEqual(args.command, 'list');
  });

  it('should parse status command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['status', 'workflow-123']);
    assertEqual(args.command, 'status');
    assertEqual(args.workflowId, 'workflow-123');
  });

  it('should parse rollback command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['rollback', 'workflow-123']);
    assertEqual(args.command, 'rollback');
    assertEqual(args.workflowId, 'workflow-123');
  });

  it('should parse --dry-run flag', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['create', 'agent', '--name', 'test', '--dry-run']);
    assert(args.options.dryRun === true, 'dryRun should be true');
  });

  it('should parse --verbose flag', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['create', 'agent', '--name', 'test', '--verbose']);
    assert(args.options.verbose === true, 'verbose should be true');
  });

  it('should show help with --help flag', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['--help']);
    assert(args.showHelp === true, 'showHelp should be true');
  });

  it('should return error for unknown command', () => {
    const { parseArgs } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const args = parseArgs(['unknown-command']);
    assert(args.error, 'Should return error for unknown command');
  });
});

describe('WorkflowCLI Class', () => {
  it('should initialize with default options', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    assert(cli, 'CLI should be created');
    assert(cli.options.workflowsDir, 'Should have workflowsDir');
    assert(cli.options.checkpointDir, 'Should have checkpointDir');
  });

  it('should accept custom options', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI({
      workflowsDir: '/custom/workflows',
      checkpointDir: '/custom/checkpoints',
    });
    assertEqual(cli.options.workflowsDir, '/custom/workflows');
    assertEqual(cli.options.checkpointDir, '/custom/checkpoints');
  });

  it('should have run method', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    assert(typeof cli.run === 'function', 'Should have run method');
  });

  it('should have getWorkflowPath method', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    assert(typeof cli.getWorkflowPath === 'function', 'Should have getWorkflowPath method');
  });

  it('should have listWorkflows method', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    assert(typeof cli.listWorkflows === 'function', 'Should have listWorkflows method');
  });

  it('resume command returns explicit not-implemented response', async () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI({
      checkpointDir: path.join(PROJECT_ROOT, '.claude', 'context', 'checkpoints'),
      testMode: true,
    });

    const result = await cli.run({
      command: 'resume',
      checkpointId: 'definitely-missing-checkpoint',
      options: {},
    });

    // Missing checkpoint still returns a failure, but if checkpoint exists we should never claim resumed=true.
    if (result && result.reason === 'resume_not_implemented') {
      assertEqual(result.resumed, false, 'resume should be false until implemented');
      assertEqual(result.success, false, 'success should be false until implemented');
    } else {
      assert(result.success === false, 'resume should fail when checkpoint cannot be loaded');
    }
  });
});

describe('Workflow Path Resolution', () => {
  it('should resolve creator workflow path', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    const workflowPath = cli.getWorkflowPath('create', 'agent');
    assert(
      workflowPath.includes('agent-creator-workflow.yaml'),
      'Should resolve to agent-creator-workflow.yaml'
    );
  });

  it('should resolve updater workflow path', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    const workflowPath = cli.getWorkflowPath('update', 'skill');
    assert(
      workflowPath.includes('skill-updater-workflow.yaml'),
      'Should resolve to skill-updater-workflow.yaml'
    );
  });

  it('should throw for unknown workflow type', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    let threw = false;
    try {
      cli.getWorkflowPath('create', 'unknown-type');
    } catch (e) {
      threw = true;
      assert(e.message.includes('not found'), 'Should mention workflow not found');
    }
    assert(threw, 'Should throw for unknown workflow type');
  });
});

describe('List Workflows', () => {
  it('should list available workflows', async () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    const workflows = await cli.listWorkflows();
    assert(Array.isArray(workflows), 'Should return array');
    assert(workflows.length > 0, 'Should find at least one workflow');
  });

  it('should include workflow metadata', async () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    const workflows = await cli.listWorkflows();
    const agentCreator = workflows.find(w => w.name === 'agent-creator');
    if (agentCreator) {
      assert(agentCreator.path, 'Should have path');
      assert(agentCreator.type, 'Should have type');
    }
  });
});

describe('Dry Run Mode', () => {
  it('should not execute workflow in dry-run mode', async () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI({ testMode: true });

    // Dry run should not throw even if workflow would fail
    const result = await cli.run({
      command: 'create',
      workflowType: 'agent',
      options: {
        name: 'test-agent',
        type: 'domain',
        dryRun: true,
      },
    });

    assert(result.dryRun === true, 'Should indicate dry run');
    assert(result.wouldExecute, 'Should show what would execute');
  });
});

describe('Verbose Output', () => {
  it('should capture verbose output when enabled', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI({ testMode: true });
    cli.setVerbose(true);

    // Capture console output
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      cli.log('Test message', 'verbose');
      assert(logs.length > 0, 'Should have logged');
    } finally {
      console.log = originalLog;
    }
  });
});

describe('Help Output', () => {
  it('should generate help text', () => {
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');
    const cli = new WorkflowCLI();
    const help = cli.getHelp();
    assert(help.includes('create'), 'Help should include create command');
    assert(help.includes('update'), 'Help should include update command');
    assert(help.includes('resume'), 'Help should include resume command');
    assert(help.includes('list'), 'Help should include list command');
    assert(help.includes('status'), 'Help should include status command');
    assert(help.includes('rollback'), 'Help should include rollback command');
    assert(help.includes('--dry-run'), 'Help should include --dry-run flag');
    assert(help.includes('--verbose'), 'Help should include --verbose flag');
  });
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
  console.log('Workflow CLI Tests');
  console.log('==================\n');

  // Setup
  cleanup();
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  try {
    await runTests();
  } finally {
    // Cleanup
    cleanup();
  }

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
