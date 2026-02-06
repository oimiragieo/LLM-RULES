#!/usr/bin/env node
/**
 * Agent Creator Workflow Tests
 * ============================
 *
 * Tests for the agent-creator-workflow.yaml
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
  '../../../.claude/workflows/creators/agent-creator-workflow.yaml'
);
const EVOLVE_PHASES = ['evaluate', 'validate', 'obtain', 'lock', 'verify', 'enable'];

// =============================================================================
// Tests
// =============================================================================

describe('Agent Creator Workflow - File Existence', () => {
  it('should have agent-creator-workflow.yaml file', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBeTruthy();
  });
});

describe('Agent Creator Workflow - YAML Parsing', () => {
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

describe('Agent Creator Workflow - Metadata', () => {
  it('should have name "agent-creator"', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.name).toBe('agent-creator');
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

  it('should have triggers array', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(Array.isArray(workflow.triggers)).toBeTruthy();
    expect(workflow.triggers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Agent Creator Workflow - EVOLVE Phases', () => {
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

describe('Agent Creator Workflow - Step IDs', () => {
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

  it('should have required fields for each step', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);

    for (const phase of EVOLVE_PHASES) {
      for (const step of workflow.phases[phase].steps) {
        expect(step.id).toBeTruthy();
        expect(step.action).toBeTruthy();
      }
    }
  });
});

describe('Agent Creator Workflow - EVALUATE Phase', () => {
  it('should have step to check existing agents', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasSearchStep = steps.some(
      s => s.id.includes('search') || s.id.includes('check') || s.id.includes('existing')
    );
    expect(hasSearchStep).toBeTruthy();
  });

  it('should have step to confirm gap', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.evaluate.steps;
    const hasConfirmStep = steps.some(s => s.id.includes('confirm') || s.id.includes('gap'));
    expect(hasConfirmStep).toBeTruthy();
  });
});

describe('Agent Creator Workflow - VALIDATE Phase', () => {
  it('should have step to check naming', () => {
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
});

describe('Agent Creator Workflow - OBTAIN Phase (Research)', () => {
  it('should have at least 3 research steps (MANDATORY)', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.obtain.steps;
    const researchSteps = steps.filter(s => s.action === 'exa_search' || s.action === 'web_search');
    expect(researchSteps.length).toBeGreaterThanOrEqual(3);
  });

  it('should have step to generate research report', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.obtain.steps;
    const hasReportStep = steps.some(s => s.id.includes('report') || s.id.includes('generate'));
    expect(hasReportStep).toBeTruthy();
  });

  it('should have research gate with minimum queries requirement', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const gates = workflow.phases.obtain.gates;
    const hasResearchGate = gates.some(
      g => g.type === 'research' || (g.minQueries && g.minQueries >= 3)
    );
    expect(hasResearchGate).toBeTruthy();
  });
});

describe('Agent Creator Workflow - LOCK Phase', () => {
  it('should have step to create agent file', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasCreateStep = steps.some(
      s => s.id.includes('write') || s.id.includes('create') || s.action === 'write'
    );
    expect(hasCreateStep).toBeTruthy();
  });

  it('should have step to add routing keywords', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasRoutingStep = steps.some(s => s.id.includes('routing') || s.id.includes('keyword'));
    expect(hasRoutingStep).toBeTruthy();
  });

  it('should have compensate/rollback configuration', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.lock.steps;
    const hasCompensate = steps.some(s => s.compensate);
    expect(hasCompensate).toBeTruthy();
  });
});

describe('Agent Creator Workflow - VERIFY Phase', () => {
  it('should have step to check placeholders', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasPlaceholderStep = steps.some(s => s.id.includes('placeholder'));
    expect(hasPlaceholderStep).toBeTruthy();
  });

  it('should have step to check required sections', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasSectionsStep = steps.some(s => s.id.includes('section') || s.id.includes('required'));
    expect(hasSectionsStep).toBeTruthy();
  });

  it('should have step to validate skills exist', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.verify.steps;
    const hasSkillsStep = steps.some(s => s.id.includes('skill'));
    expect(hasSkillsStep).toBeTruthy();
  });
});

describe('Agent Creator Workflow - ENABLE Phase', () => {
  it('should have step to update CLAUDE.md', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasClaudeMdStep = steps.some(
      s => s.id.includes('claude') || s.id.includes('routing_table')
    );
    expect(hasClaudeMdStep).toBeTruthy();
  });

  it('should have step to update memory', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const steps = workflow.phases.enable.steps;
    const hasMemoryStep = steps.some(s => s.id.includes('memory'));
    expect(hasMemoryStep).toBeTruthy();
  });

  it('should have registration gate', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const gates = workflow.phases.enable.gates;
    const hasRegistrationGate = gates.some(g => g.type === 'registration');
    expect(hasRegistrationGate).toBeTruthy();
  });
});

describe('Agent Creator Workflow - Rollback Configuration', () => {
  it('should have rollback section', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.rollback).toBeTruthy();
  });

  it('should have saga strategy', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.rollback.strategy).toBe('saga');
  });

  it('should have compensations defined', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.rollback.compensations).toBeTruthy();
    expect(
      Array.isArray(workflow.rollback.compensations) ||
        typeof workflow.rollback.compensations === 'object'
    ).toBeTruthy();
  });
});

describe('Agent Creator Workflow - Metadata Iron Laws', () => {
  it('should have iron_laws in metadata', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    expect(workflow.metadata).toBeTruthy();
    expect(workflow.metadata.iron_laws).toBeTruthy();
  });

  it('should include NO AGENT WITHOUT ROUTER KEYWORDS', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.metadata.iron_laws;
    const hasRouterLaw = laws.some(law => law.includes('ROUTER') || law.includes('KEYWORD'));
    expect(hasRouterLaw).toBeTruthy();
  });

  it('should include RESEARCH BEFORE CREATE', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.metadata.iron_laws;
    const hasResearchLaw = laws.some(law => law.includes('RESEARCH'));
    expect(hasResearchLaw).toBeTruthy();
  });

  it('should include MEMORY PROTOCOL MANDATORY', () => {
    const content = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    const workflow = parseWorkflow(content);
    const laws = workflow.metadata.iron_laws;
    const hasMemoryLaw = laws.some(law => law.includes('MEMORY'));
    expect(hasMemoryLaw).toBeTruthy();
  });
});

describe('Agent Creator Workflow - WorkflowEngine Integration', () => {
  it('should load successfully with WorkflowEngine', async () => {
    const engine = new WorkflowEngine(WORKFLOW_PATH);
    await engine.load();
    expect(engine.isValid).toBeTruthy();
    expect(engine.workflow).toBeTruthy();
  });
});

// Run tests
runTests();
