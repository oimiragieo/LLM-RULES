#!/usr/bin/env node
/**
 * Workflow Creator Workflow Tests
 * ================================
 *
 * Tests for the workflow-creator-workflow.yaml
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
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
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
  '../../../.claude/workflows/creators/workflow-creator-workflow.yaml'
);
const EVOLVE_PHASES = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// Tests
// =============================================================================

describe('Workflow Creator Workflow - File Existence', () => {
  it('should have workflow-creator-workflow.yaml file', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - YAML Parsing', () => {
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

describe('Workflow Creator Workflow - Metadata', () => {
  it('should have name "workflow-creator-workflow"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.name).toBe('workflow-creator-workflow');
  });

  it('should have version', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.version).toBeTruthy();
  });

  it('should have description', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.description).toBeTruthy();
  });

  it('should have artifact_type "workflow"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.artifact_type).toBe('workflow');
  });
});

describe('Workflow Creator Workflow - EVOLVE Phases', () => {
  it('should have all 6 EVOLVE phases', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.phases).toBeTruthy();

    for (const phase of EVOLVE_PHASES) {
      expect(workflow.phases).toHaveProperty(phase);
    }
  });

  it('should have description for each phase', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      expect(workflow.phases[phase].description).toBeTruthy();
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

describe('Workflow Creator Workflow - Step IDs', () => {
  it('should have unique step IDs across all phases', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const stepIds = new Set();

    for (const phase of EVOLVE_PHASES) {
      for (const step of workflow.phases[phase].steps) {
        if (stepIds.has(step.id)) {
          throw new Error(`Duplicate step ID: ${step.id}`);
        }
        stepIds.add(step.id);
      }
    }

    expect(stepIds.size).toBeGreaterThanOrEqual(EVOLVE_PHASES.length);
  });
});

describe('Workflow Creator Workflow - EVALUATE Phase', () => {
  it('should have step to check existing workflows', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasCheckStep = steps.some(s => s.id.includes('existing') || s.id.includes('check'));
    expect(hasCheckStep).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - VALIDATE Phase', () => {
  it('should have step to validate naming', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasNamingStep = steps.some(s => s.id.includes('naming') || s.id.includes('name'));
    expect(hasNamingStep).toBeTruthy();
  });

  it('should have step to check conflicts', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasConflictStep = steps.some(s => s.id.includes('conflict'));
    expect(hasConflictStep).toBeTruthy();
  });

  it('should have step to validate phase structure', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasPhaseStep = steps.some(s => s.id.includes('phase'));
    expect(hasPhaseStep).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - LOCK Phase', () => {
  it('should have step to generate workflow YAML', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasGenerateStep = steps.some(s => s.id.includes('generate') || s.id.includes('write'));
    expect(hasGenerateStep).toBeTruthy();
  });

  it('should have step to validate YAML syntax', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasYamlStep = steps.some(s => s.id.includes('yaml'));
    expect(hasYamlStep).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - VERIFY Phase', () => {
  it('should have step to validate phases', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasPhasesStep = steps.some(s => s.id.includes('phase'));
    expect(hasPhasesStep).toBeTruthy();
  });

  it('should have step to validate gates', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasGatesStep = steps.some(s => s.id.includes('gate'));
    expect(hasGatesStep).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - ENABLE Phase', () => {
  it('should have step to update CLAUDE.md', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasClaudeMdStep = steps.some(s => s.id.includes('claude'));
    expect(hasClaudeMdStep).toBeTruthy();
  });

  it('should have step to update memory', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasMemoryStep = steps.some(s => s.id.includes('memory'));
    expect(hasMemoryStep).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - Compensate Configuration', () => {
  it('should have compensate section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.compensate).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - Iron Laws', () => {
  it('should have iron_laws section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.iron_laws).toBeTruthy();
  });

  it('should include EVOLVE phase enforcement', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.iron_laws;
    const hasEvolveLaw = laws.some(law => law.rule && law.rule.includes('EVOLVE'));
    expect(hasEvolveLaw).toBeTruthy();
  });
});

describe('Workflow Creator Workflow - WorkflowEngine Integration', () => {
  it('should load successfully with WorkflowEngine', async () => {
    const engine = new WorkflowEngine(WORKFLOW_PATH);
    await engine.load();
    expect(engine.isValid).toBeTruthy();
    expect(engine.workflow).toBeTruthy();
  });
});

// Run tests
runTests();
