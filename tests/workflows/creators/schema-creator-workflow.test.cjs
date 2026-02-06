#!/usr/bin/env node
/**
 * Schema Creator Workflow Tests
 * ==============================
 *
 * Tests for the schema-creator-workflow.yaml
 * Validates YAML structure, EVOLVE phases, gates, and step definitions.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseWorkflow,
  validateWorkflow,
  WorkflowEngine,
} = require('../../../.claude/lib/workflow/workflow-engine.cjs');

// =============================================================================
// Test Framework
// =============================================================================

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
      passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (error) {
      failed++;
      console.log(`  ✗ ${test.name}`);
      console.log(`    Error: ${error.message}`);
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toHaveProperty(prop) {
      if (!(prop in actual)) {
        throw new Error(`Expected object to have property "${prop}"`);
      }
    },
  };
}

// =============================================================================
// Constants
// =============================================================================

const WORKFLOW_PATH = path.join(
  __dirname,
  '../../../.claude/workflows/creators/schema-creator-workflow.yaml'
);
const EVOLVE_PHASES = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// Tests
// =============================================================================

describe('Schema Creator Workflow - File Existence', () => {
  it('should have schema-creator-workflow.yaml file', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBeTruthy();
  });
});

describe('Schema Creator Workflow - YAML Parsing', () => {
  it('should parse without errors', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow).toBeTruthy();
  });

  it('should have valid workflow structure', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const validation = validateWorkflow(workflow);
    expect(validation.valid).toBeTruthy();
  });
});

describe('Schema Creator Workflow - Metadata', () => {
  it('should have name "schema-creator-workflow"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.name).toBe('schema-creator-workflow');
  });

  it('should have version', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.version).toBeTruthy();
  });

  it('should have artifact_type "schema"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.artifact_type).toBe('schema');
  });
});

describe('Schema Creator Workflow - EVOLVE Phases', () => {
  it('should have all 6 EVOLVE phases', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.phases).toBeTruthy();

    for (const phase of EVOLVE_PHASES) {
      expect(workflow.phases).toHaveProperty(phase);
    }
  });

  it('should have steps array for each phase', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      expect(Array.isArray(workflow.phases[phase].steps)).toBeTruthy();
      expect(workflow.phases[phase].steps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should have gates array for each phase', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      expect(Array.isArray(workflow.phases[phase].gates)).toBeTruthy();
      expect(workflow.phases[phase].gates.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Schema Creator Workflow - VALIDATE Phase', () => {
  it('should have step to validate naming', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasNamingStep = steps.some(s => s.id.includes('naming') || s.id.includes('name'));
    expect(hasNamingStep).toBeTruthy();
  });

  it('should have step to validate property names', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasPropertyStep = steps.some(s => s.id.includes('property'));
    expect(hasPropertyStep).toBeTruthy();
  });
});

describe('Schema Creator Workflow - LOCK Phase', () => {
  it('should have step to generate schema JSON', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasGenerateStep = steps.some(s => s.id.includes('generate') || s.id.includes('schema'));
    expect(hasGenerateStep).toBeTruthy();
  });

  it('should have step to validate JSON syntax', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasJsonStep = steps.some(s => s.id.includes('json'));
    expect(hasJsonStep).toBeTruthy();
  });

  it('should have step to validate schema structure', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasStructureStep = steps.some(s => s.id.includes('structure'));
    expect(hasStructureStep).toBeTruthy();
  });
});

describe('Schema Creator Workflow - VERIFY Phase', () => {
  it('should have step to validate required fields', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasFieldsStep = steps.some(s => s.id.includes('field') || s.id.includes('required'));
    expect(hasFieldsStep).toBeTruthy();
  });

  it('should have step to test schema validation', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasTestStep = steps.some(s => s.id.includes('test'));
    expect(hasTestStep).toBeTruthy();
  });
});

describe('Schema Creator Workflow - ENABLE Phase', () => {
  it('should have step to update memory', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasMemoryStep = steps.some(s => s.id.includes('memory'));
    expect(hasMemoryStep).toBeTruthy();
  });

  it('should have step to verify registration', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasVerifyStep = steps.some(s => s.id.includes('verify') || s.id.includes('registration'));
    expect(hasVerifyStep).toBeTruthy();
  });
});

describe('Schema Creator Workflow - Iron Laws', () => {
  it('should have iron_laws section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.iron_laws).toBeTruthy();
  });

  it('should enforce $schema requirement', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.iron_laws;
    const hasSchemaLaw = laws.some(law => law.rule && law.rule.includes('$schema'));
    expect(hasSchemaLaw).toBeTruthy();
  });
});

describe('Schema Creator Workflow - WorkflowEngine Integration', () => {
  it('should load successfully with WorkflowEngine', async () => {
    const engine = new WorkflowEngine(WORKFLOW_PATH);
    await engine.load();
    expect(engine.isValid).toBeTruthy();
    expect(engine.workflow).toBeTruthy();
  });
});

// Run tests
runTests();
