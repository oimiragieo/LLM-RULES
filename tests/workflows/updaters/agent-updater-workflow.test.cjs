#!/usr/bin/env node
/**
 * Agent Updater Workflow Tests
 * =============================
 *
 * Tests for the agent-updater-workflow.yaml
 * Validates YAML structure, EVOLVE phases, gates, and updater-specific features.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseWorkflow,
  validateWorkflow,
  WorkflowEngine,
} = require('../../.claude/lib/workflow/workflow-engine.cjs');

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

const WORKFLOW_PATH = path.join(__dirname, 'agent-updater-workflow.yaml');
const EVOLVE_PHASES = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// Tests
// =============================================================================

describe('Agent Updater Workflow - File Existence', () => {
  it('should have agent-updater-workflow.yaml file', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBeTruthy();
  });
});

describe('Agent Updater Workflow - YAML Parsing', () => {
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

describe('Agent Updater Workflow - Metadata', () => {
  it('should have name "agent-updater-workflow"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.name).toBe('agent-updater-workflow');
  });

  it('should have artifact_type "agent"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.artifact_type).toBe('agent');
  });

  it('should have updater_config', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.updater_config).toBeTruthy();
  });

  it('should have backup_enabled in updater_config', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.updater_config.backup_enabled).toBe(true);
  });
});

describe('Agent Updater Workflow - EVOLVE Phases', () => {
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

describe('Agent Updater Workflow - EVALUATE Phase (Updater-Specific)', () => {
  it('should have step to load existing agent', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasLoadStep = steps.some(s => s.id.includes('load') || s.id.includes('existing'));
    expect(hasLoadStep).toBeTruthy();
  });

  it('should have step to validate change justification', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasJustificationStep = steps.some(s => s.id.includes('justification'));
    expect(hasJustificationStep).toBeTruthy();
  });
});

describe('Agent Updater Workflow - VALIDATE Phase (Updater-Specific)', () => {
  it('should have step to check protected sections', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasProtectedStep = steps.some(s => s.id.includes('protected'));
    expect(hasProtectedStep).toBeTruthy();
  });

  it('should have step to check dependency impact', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.validate.steps;
    const hasDependencyStep = steps.some(
      s => s.id.includes('dependency') || s.id.includes('impact')
    );
    expect(hasDependencyStep).toBeTruthy();
  });
});

describe('Agent Updater Workflow - LOCK Phase (Updater-Specific)', () => {
  it('should have step to create backup', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasBackupStep = steps.some(s => s.id.includes('backup'));
    expect(hasBackupStep).toBeTruthy();
  });

  it('should have step to apply changes', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasApplyStep = steps.some(s => s.id.includes('apply') || s.id.includes('change'));
    expect(hasApplyStep).toBeTruthy();
  });

  it('should have backup gate to ensure backup is created', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const gates = workflow.phases.lock.gates;
    const hasBackupGate = gates.some(g => g.id && g.id.includes('backup'));
    expect(hasBackupGate).toBeTruthy();
  });
});

describe('Agent Updater Workflow - VERIFY Phase (Updater-Specific)', () => {
  it('should have step to validate YAML frontmatter', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasYamlStep = steps.some(s => s.id.includes('yaml'));
    expect(hasYamlStep).toBeTruthy();
  });

  it('should have step to check required sections', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasSectionsStep = steps.some(s => s.id.includes('section') || s.id.includes('required'));
    expect(hasSectionsStep).toBeTruthy();
  });
});

describe('Agent Updater Workflow - ENABLE Phase (Updater-Specific)', () => {
  it('should have step to update memory', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasMemoryStep = steps.some(s => s.id.includes('memory'));
    expect(hasMemoryStep).toBeTruthy();
  });

  it('should have step to cleanup backup on success', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasCleanupStep = steps.some(s => s.id.includes('cleanup') || s.id.includes('backup'));
    expect(hasCleanupStep).toBeTruthy();
  });
});

describe('Agent Updater Workflow - Compensate Configuration', () => {
  it('should have compensate section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.compensate).toBeTruthy();
  });

  it('should have restore_backup action in lock compensate', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const lockCompensate = workflow.compensate.lock;
    expect(lockCompensate).toBeTruthy();
    const hasRestoreAction = lockCompensate.some(a => a.action && a.action.includes('restore'));
    expect(hasRestoreAction).toBeTruthy();
  });
});

describe('Agent Updater Workflow - Iron Laws', () => {
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

  it('should enforce justification requirement', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.iron_laws;
    const hasJustificationLaw = laws.some(
      law =>
        (law.rule && law.rule.toLowerCase().includes('justification')) ||
        law.rule.toLowerCase().includes('justified')
    );
    expect(hasJustificationLaw).toBeTruthy();
  });
});

describe('Agent Updater Workflow - WorkflowEngine Integration', () => {
  it('should load successfully with WorkflowEngine', async () => {
    const engine = new WorkflowEngine(WORKFLOW_PATH);
    await engine.load();
    expect(engine.isValid).toBeTruthy();
    expect(engine.workflow).toBeTruthy();
  });
});

// Run tests
runTests();
