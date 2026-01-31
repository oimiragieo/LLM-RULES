#!/usr/bin/env node
/**
 * Hook Updater Workflow Tests
 * ============================
 *
 * Tests for the hook-updater-workflow.yaml
 * Validates YAML structure, EVOLVE phases, gates, and updater-specific features.
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

const WORKFLOW_PATH = path.join(__dirname, 'hook-updater-workflow.yaml');
const EVOLVE_PHASES = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// Tests
// =============================================================================

describe('Hook Updater Workflow - File Existence', () => {
  it('should have hook-updater-workflow.yaml file', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBeTruthy();
  });
});

describe('Hook Updater Workflow - YAML Parsing', () => {
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

describe('Hook Updater Workflow - Metadata', () => {
  it('should have name "hook-updater-workflow"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.name).toBe('hook-updater-workflow');
  });

  it('should have artifact_type "hook"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.artifact_type).toBe('hook');
  });

  it('should have updater_config with backup_enabled', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.updater_config).toBeTruthy();
    expect(workflow.updater_config.backup_enabled).toBe(true);
  });
});

describe('Hook Updater Workflow - EVOLVE Phases', () => {
  it('should have all 6 EVOLVE phases', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      expect(workflow.phases).toHaveProperty(phase);
    }
  });

  it('should have steps and gates for each phase', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      expect(Array.isArray(workflow.phases[phase].steps)).toBeTruthy();
      expect(Array.isArray(workflow.phases[phase].gates)).toBeTruthy();
    }
  });
});

describe('Hook Updater Workflow - EVALUATE Phase', () => {
  it('should have step to load existing hook', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasLoadStep = steps.some(s => s.id.includes('load') || s.id.includes('existing'));
    expect(hasLoadStep).toBeTruthy();
  });
});

describe('Hook Updater Workflow - VALIDATE Phase', () => {
  it('should have step to check protected exports', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasExportsStep = steps.some(s => s.id.includes('export') || s.id.includes('protected'));
    expect(hasExportsStep).toBeTruthy();
  });

  it('should have step to check signature changes', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasSignatureStep = steps.some(s => s.id.includes('signature'));
    expect(hasSignatureStep).toBeTruthy();
  });
});

describe('Hook Updater Workflow - LOCK Phase', () => {
  it('should have step to create backup', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasBackupStep = steps.some(s => s.id.includes('backup'));
    expect(hasBackupStep).toBeTruthy();
  });

  it('should have step to update tests if needed', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasTestStep = steps.some(s => s.id.includes('test'));
    expect(hasTestStep).toBeTruthy();
  });
});

describe('Hook Updater Workflow - VERIFY Phase', () => {
  it('should have step to run tests', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasTestStep = steps.some(s => s.id.includes('test'));
    expect(hasTestStep).toBeTruthy();
  });

  it('should have step to validate exports', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasExportsStep = steps.some(s => s.id.includes('export'));
    expect(hasExportsStep).toBeTruthy();
  });

  it('should have step to check graceful degradation', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasGracefulStep = steps.some(s => s.id.includes('graceful'));
    expect(hasGracefulStep).toBeTruthy();
  });
});

describe('Hook Updater Workflow - ENABLE Phase', () => {
  it('should have step to update settings if needed', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasSettingsStep = steps.some(s => s.id.includes('settings'));
    expect(hasSettingsStep).toBeTruthy();
  });
});

describe('Hook Updater Workflow - Iron Laws', () => {
  it('should have iron_laws section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.iron_laws).toBeTruthy();
  });

  it('should enforce backup requirement', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.iron_laws;
    const hasBackupLaw = laws.some(law => law.rule && law.rule.toLowerCase().includes('backup'));
    expect(hasBackupLaw).toBeTruthy();
  });

  it('should enforce tests must pass', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.iron_laws;
    const hasTestLaw = laws.some(law => law.rule && law.rule.toLowerCase().includes('test'));
    expect(hasTestLaw).toBeTruthy();
  });
});

describe('Hook Updater Workflow - WorkflowEngine Integration', () => {
  it('should load successfully with WorkflowEngine', async () => {
    const engine = new WorkflowEngine(WORKFLOW_PATH);
    await engine.load();
    expect(engine.isValid).toBeTruthy();
    expect(engine.workflow).toBeTruthy();
  });
});

// Run tests
runTests();
