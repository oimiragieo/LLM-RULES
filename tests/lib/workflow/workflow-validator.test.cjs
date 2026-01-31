#!/usr/bin/env node
/**
 * Workflow Validator Tests
 * ========================
 *
 * Tests for the workflow YAML validator.
 * Follows TDD - these tests were written FIRST.
 */

'use strict';

const fs = require('fs');
const path = require('path');

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
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'test-validator-temp');

// Cleanup function
function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Test workflows
const VALID_WORKFLOW = `
name: test-workflow
version: 1.0.0
description: Test workflow for validation

phases:
  evaluate:
    description: Evaluate phase
    steps:
      - id: step1
        action: prompt
        description: Confirm step
    gates:
      - type: assertion
        condition: true
        message: Must be true

  validate:
    description: Validate phase
    steps:
      - id: step2
        action: validate
        description: Validate step

  obtain:
    description: Obtain phase
    steps:
      - id: step3
        action: search
        description: Search step

  lock:
    description: Lock phase
    steps:
      - id: step4
        action: write
        description: Write step
        compensate:
          type: file:create

  verify:
    description: Verify phase
    steps:
      - id: step5
        action: validate
        description: Final validation

  enable:
    description: Enable phase
    steps:
      - id: step6
        action: edit
        description: Enable step

rollback:
  strategy: saga
  compensations:
    - file:create: delete file

metadata:
  iron_laws:
    - TEST LAW 1
`;

const INVALID_WORKFLOW_NO_NAME = `
version: 1.0.0
description: Missing name field
phases:
  evaluate:
    steps:
      - id: step1
        action: prompt
`;

const INVALID_WORKFLOW_NO_PHASES = `
name: test
version: 1.0.0
description: Missing phases
`;

const INVALID_WORKFLOW_DUPLICATE_IDS = `
name: test
version: 1.0.0
phases:
  evaluate:
    steps:
      - id: step1
        action: prompt
      - id: step1
        action: validate
`;

const _INVALID_WORKFLOW_MISSING_OBTAIN = `
name: test
version: 1.0.0
phases:
  evaluate:
    steps:
      - id: step1
        action: prompt
  validate:
    steps:
      - id: step2
        action: validate
  lock:
    steps:
      - id: step3
        action: write
  verify:
    steps:
      - id: step4
        action: validate
  enable:
    steps:
      - id: step5
        action: edit
`;

const INVALID_WORKFLOW_NO_ROLLBACK = `
name: test
version: 1.0.0
phases:
  evaluate:
    steps:
      - id: step1
        action: write
        compensate:
          type: file:create
`;

const INVALID_WORKFLOW_STEP_MISSING_ID = `
name: test
version: 1.0.0
description: Step missing id
phases:
  evaluate:
    steps:
      - action: prompt
        description: This step is missing an id field
  validate:
    steps:
      - id: step2
        action: validate
  obtain:
    steps:
      - id: step3
        action: search
  lock:
    steps:
      - id: step4
        action: write
  verify:
    steps:
      - id: step5
        action: validate
  enable:
    steps:
      - id: step6
        action: edit
`;

const INVALID_WORKFLOW_STEP_MISSING_HANDLER = `
name: test
version: 1.0.0
description: Step missing handler
phases:
  evaluate:
    steps:
      - id: step1
        description: This step is missing a handler or action field
  validate:
    steps:
      - id: step2
        action: validate
  obtain:
    steps:
      - id: step3
        action: search
  lock:
    steps:
      - id: step4
        action: write
  verify:
    steps:
      - id: step5
        action: validate
  enable:
    steps:
      - id: step6
        action: edit
`;

const VALID_WORKFLOW_WITH_HANDLER = `
name: test
version: 1.0.0
description: Workflow with step using handler instead of action
phases:
  evaluate:
    steps:
      - id: step1
        handler: customHandler
        description: Step with handler field
  validate:
    steps:
      - id: step2
        action: validate
  obtain:
    steps:
      - id: step3
        action: search
  lock:
    steps:
      - id: step4
        action: write
  verify:
    steps:
      - id: step5
        action: validate
  enable:
    steps:
      - id: step6
        action: edit
`;

// =============================================================================
// Tests
// =============================================================================

describe('WorkflowValidator Module', () => {
  it('should export WorkflowValidator class', () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    assert(WorkflowValidator, 'WorkflowValidator should be exported');
    assert(typeof WorkflowValidator === 'function', 'WorkflowValidator should be a class');
  });

  it('should export validateEvolvePhases function', () => {
    const { validateEvolvePhases } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    assert(validateEvolvePhases, 'validateEvolvePhases should be exported');
    assert(typeof validateEvolvePhases === 'function', 'validateEvolvePhases should be a function');
  });

  it('should export EVOLVE_PHASES constant', () => {
    const { EVOLVE_PHASES } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    assert(EVOLVE_PHASES, 'EVOLVE_PHASES should be exported');
    assert(EVOLVE_PHASES.includes('evaluate'), 'Should include evaluate');
    assert(EVOLVE_PHASES.includes('obtain'), 'Should include obtain');
  });
});

describe('WorkflowValidator Basic Validation', () => {
  it('should validate a correct workflow', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    // Write test workflow
    const testPath = path.join(TEST_DIR, 'valid-workflow.yaml');
    fs.writeFileSync(testPath, VALID_WORKFLOW);

    const result = await validator.validate(testPath);
    assert(result.valid === true, 'Valid workflow should pass');
    assertEqual(result.errors.length, 0, 'Should have no errors');
  });

  it('should detect missing name field', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'no-name.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_NO_NAME);

    const result = await validator.validate(testPath);
    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('name')),
      'Should mention missing name'
    );
  });

  it('should detect missing phases field', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'no-phases.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_NO_PHASES);

    const result = await validator.validate(testPath);
    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('phases')),
      'Should mention missing phases'
    );
  });

  it('should detect duplicate step IDs', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'dup-ids.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_DUPLICATE_IDS);

    const result = await validator.validate(testPath);
    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('Duplicate') || e.includes('duplicate')),
      'Should mention duplicate'
    );
  });
});

describe('EVOLVE Phase Validation', () => {
  it('should check for all EVOLVE phases', () => {
    const { validateEvolvePhases } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const workflow = {
      phases: {
        evaluate: {},
        validate: {},
        obtain: {},
        lock: {},
        verify: {},
        enable: {},
      },
    };

    const result = validateEvolvePhases(workflow);
    assert(result.valid === true, 'Should have all phases');
  });

  it('should detect missing OBTAIN phase', () => {
    const { validateEvolvePhases } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const workflow = {
      phases: {
        evaluate: {},
        validate: {},
        lock: {},
        verify: {},
        enable: {},
      },
    };

    const result = validateEvolvePhases(workflow);
    assert(result.valid === false, 'Should be invalid without obtain');
    assert(result.missing.includes('obtain'), 'Should list obtain as missing');
  });

  it('should warn about missing EVALUATE phase', () => {
    const { validateEvolvePhases } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const workflow = {
      phases: {
        validate: {},
        obtain: {},
        lock: {},
        verify: {},
        enable: {},
      },
    };

    const result = validateEvolvePhases(workflow);
    assert(result.valid === false, 'Should be invalid without evaluate');
    assert(result.missing.includes('evaluate'), 'Should list evaluate as missing');
  });
});

describe('Gate Validation', () => {
  it('should validate gate conditions', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkGates({
      phases: {
        evaluate: {
          gates: [{ type: 'assertion', condition: 'true', message: 'Test' }],
        },
      },
    });

    assert(result.valid === true, 'Valid gates should pass');
  });

  it('should detect gate without condition', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkGates({
      phases: {
        evaluate: {
          gates: [{ type: 'assertion', message: 'Missing condition' }],
        },
      },
    });

    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('condition')),
      'Should mention missing condition'
    );
  });

  it('should detect gate without message', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkGates({
      phases: {
        evaluate: {
          gates: [{ type: 'assertion', condition: 'true' }],
        },
      },
    });

    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('message')),
      'Should mention missing message'
    );
  });
});

describe('Rollback Action Validation', () => {
  it('should validate rollback configuration', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkRollbackActions({
      rollback: {
        strategy: 'saga',
        compensations: [{ 'file:create': 'delete file' }],
      },
    });

    assert(result.valid === true, 'Valid rollback should pass');
  });

  it('should require rollback for workflows with compensate steps', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'no-rollback.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_NO_ROLLBACK);

    const result = await validator.validate(testPath);
    // Workflow has compensate but no rollback - should warn
    assert(result.warnings && result.warnings.length > 0, 'Should have warnings');
  });
});

describe('Step Schema Validation', () => {
  it('should validate a single step with required id', () => {
    const { validateSingleStep } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const step = { id: 'step1', handler: 'myHandler' };
    const errors = validateSingleStep(step, 'evaluate', 1);
    assert(errors.length === 0, 'Step with id and handler should be valid');
  });

  it('should detect step missing id field', () => {
    const { validateSingleStep } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const step = { handler: 'myHandler' };
    const errors = validateSingleStep(step, 'evaluate', 1);
    assert(errors.length > 0, 'Should have errors');
    assert(
      errors.some(e => e.includes('missing') && e.includes('id')),
      'Should mention missing id'
    );
  });

  it('should detect step missing handler/action field', () => {
    const { validateSingleStep } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const step = { id: 'step1' };
    const errors = validateSingleStep(step, 'evaluate', 1);
    assert(errors.length > 0, 'Should have errors');
    assert(
      errors.some(e => (e.includes('handler') || e.includes('action')) && e.includes('missing')),
      'Should mention missing handler or action'
    );
  });

  it('should validate step with action field instead of handler', () => {
    const { validateSingleStep } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const step = { id: 'step1', action: 'prompt' };
    const errors = validateSingleStep(step, 'evaluate', 1);
    assert(errors.length === 0, 'Step with id and action should be valid');
  });

  it('should validate entire workflow step schemas', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const workflow = {
      phases: {
        evaluate: {
          steps: [{ id: 'step1', action: 'prompt' }],
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert(result.valid === true, 'Workflow with valid steps should pass');
    assert(result.errors.length === 0, 'Should have no errors');
  });

  it('should detect invalid steps across all phases', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const workflow = {
      phases: {
        evaluate: {
          steps: [{ id: 'step1', action: 'prompt' }],
        },
        validate: {
          steps: [{ action: 'validate' }], // Missing id
        },
        obtain: {
          steps: [{ id: 'step3' }], // Missing handler/action
        },
      },
    };

    const result = validator.validateStepSchema(workflow);
    assert(result.valid === false, 'Should be invalid');
    assert(result.errors.length >= 2, 'Should detect both errors');
  });

  it('should reject workflow with step missing id field', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'step-missing-id.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_STEP_MISSING_ID);

    const result = await validator.validate(testPath);
    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(e => e.includes('missing') && e.includes('id')),
      'Should mention missing id in step'
    );
  });

  it('should reject workflow with step missing handler', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'step-missing-handler.yaml');
    fs.writeFileSync(testPath, INVALID_WORKFLOW_STEP_MISSING_HANDLER);

    const result = await validator.validate(testPath);
    assert(result.valid === false, 'Should be invalid');
    assert(
      result.errors.some(
        e => (e.includes('handler') || e.includes('action')) && e.includes('missing')
      ),
      'Should mention missing handler or action'
    );
  });

  it('should accept workflow with handler field', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const testPath = path.join(TEST_DIR, 'valid-handler.yaml');
    fs.writeFileSync(testPath, VALID_WORKFLOW_WITH_HANDLER);

    const result = await validator.validate(testPath);
    assert(result.valid === true, 'Workflow with valid handler should pass');
    assert(result.errors.length === 0, 'Should have no errors');
  });
});

describe('Iron Laws Validation', () => {
  it('should check for iron laws in metadata', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkIronLaws({
      metadata: {
        iron_laws: ['NO ARTIFACT WITHOUT RESEARCH'],
      },
    });

    assert(result.valid === true, 'Should pass with iron laws');
  });

  it('should warn when no iron laws defined', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const result = validator.checkIronLaws({
      metadata: {},
    });

    assert(result.warnings && result.warnings.length > 0, 'Should have warnings');
  });
});

describe('Validate All Workflows', () => {
  it('should validate all workflows in a directory', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    // Use actual creators directory
    const creatorsDir = path.join(PROJECT_ROOT, '.claude', 'workflows', 'creators');
    const results = await validator.validateAll(creatorsDir);

    assert(Array.isArray(results), 'Should return array');
    // Should have validated at least the agent-creator-workflow.yaml
    assert(results.length > 0, 'Should validate at least one workflow');
  });

  it('should generate validation report', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const validator = new WorkflowValidator();

    const results = [
      { path: 'workflow1.yaml', valid: true, errors: [] },
      { path: 'workflow2.yaml', valid: false, errors: ['Error 1'] },
    ];

    const report = validator.generateReport(results);

    assert(report.includes('workflow1.yaml'), 'Should include workflow1');
    assert(report.includes('workflow2.yaml'), 'Should include workflow2');
    assert(report.includes('PASS') || report.includes('pass'), 'Should show passed');
    assert(report.includes('FAIL') || report.includes('fail'), 'Should show failed');
  });
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
  console.log('Workflow Validator Tests');
  console.log('========================\n');

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
