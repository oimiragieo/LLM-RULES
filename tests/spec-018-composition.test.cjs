/**
 * SPEC-018: Workflow Composition & Nesting
 *
 * Tests for workflow composition, inheritance, cycle detection, and hierarchy flattening.
 * TDD RED Phase: All tests should FAIL (MODULE_NOT_FOUND or function not implemented).
 *
 * Categories:
 * - Category 1: Workflow Composition (15 tests)
 * - Category 2: Workflow Inheritance (15 tests)
 * - Category 3: Cycle Detection (15 tests)
 * - Category 4: Hierarchy Flattening (15 tests)
 * - Category 5: Validation & Error Handling (10 tests)
 *
 * Total: 70+ tests
 */

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Imports (will fail initially - TDD RED phase)
const { WorkflowComposer } = require('../.claude/lib/workflow/workflow-composer.cjs');
const { WorkflowResolver } = require('../.claude/lib/workflow/workflow-resolver.cjs');
const { CycleDetector } = require('../.claude/lib/workflow/cycle-detector.cjs');
const { WorkflowValidator } = require('../.claude/lib/workflow/workflow-validator.cjs');

// =============================================================================
// Category 1: Workflow Composition (15 tests)
// =============================================================================

describe('SPEC-018 Category 1: Workflow Composition', () => {
  let composer;

  beforeEach(() => {
    composer = new WorkflowComposer();
  });

  // Basic composition
  test('01.01: should compose two workflows sequentially', async () => {
    const workflow1 = {
      name: 'workflow1',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
      ]
    };
    const workflow2 = {
      name: 'workflow2',
      phases: [
        { name: 'phase3', tasks: ['task3'] },
      ]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [workflow1, workflow2]
    });

    assert.strictEqual(composed.phases.length, 3);
    assert.strictEqual(composed.phases[0].name, 'phase1');
    assert.strictEqual(composed.phases[2].name, 'phase3');
  });

  test('01.02: should compose workflows in parallel', async () => {
    const workflow1 = {
      name: 'workflow1',
      phases: [{ name: 'phase1', tasks: ['task1'] }]
    };
    const workflow2 = {
      name: 'workflow2',
      phases: [{ name: 'phase2', tasks: ['task2'] }]
    };

    const composed = await composer.compose({
      strategy: 'parallel',
      workflows: [workflow1, workflow2]
    });

    assert.strictEqual(composed.phases.length, 1);
    assert.strictEqual(composed.phases[0].parallel.length, 2);
  });

  // Include pattern
  test('01.03: should include sub-workflow at specific point', async () => {
    const mainWorkflow = {
      name: 'main',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { include: 'sub-workflow' },
        { name: 'phase3', tasks: ['task3'] },
      ]
    };
    const subWorkflow = {
      name: 'sub-workflow',
      phases: [
        { name: 'phase2', tasks: ['task2'] },
      ]
    };

    // Mock workflow loading
    composer.loadWorkflow = async (name) => {
      if (name === 'sub-workflow') return subWorkflow;
      throw new Error(`Workflow not found: ${name}`);
    };

    const flattened = await composer.flatten(mainWorkflow);

    assert.strictEqual(flattened.phases.length, 3);
    assert.strictEqual(flattened.phases[1].name, 'phase2');
  });

  test('01.04: should include multiple sub-workflows', async () => {
    const mainWorkflow = {
      name: 'main',
      phases: [
        { include: 'sub1' },
        { include: 'sub2' },
        { include: 'sub3' },
      ]
    };

    composer.loadWorkflow = async (name) => ({
      name,
      phases: [{ name: `${name}-phase`, tasks: [`${name}-task`] }]
    });

    const flattened = await composer.flatten(mainWorkflow);
    assert.strictEqual(flattened.phases.length, 3);
  });

  // Extend pattern
  test('01.05: should extend base workflow with overrides', async () => {
    const baseWorkflow = {
      name: 'base',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
      ]
    };
    const extendedWorkflow = {
      name: 'extended',
      extends: 'base',
      overrides: {
        phase2: {
          tasks: ['task2', 'task2b'] // Add task
        }
      }
    };

    composer.loadWorkflow = async (name) => {
      if (name === 'base') return baseWorkflow;
      throw new Error(`Workflow not found: ${name}`);
    };

    const result = await composer.flatten(extendedWorkflow);
    assert.strictEqual(result.phases[1].tasks.length, 2);
  });

  test('01.06: should add phases in extended workflow', async () => {
    const baseWorkflow = {
      name: 'base',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
      ]
    };
    const extendedWorkflow = {
      name: 'extended',
      extends: 'base',
      overrides: {
        phase2: {
          add: { name: 'phase2', tasks: ['task2'] },
          after: 'phase1'
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'base' ? baseWorkflow : null;

    const result = await composer.flatten(extendedWorkflow);
    assert.strictEqual(result.phases.length, 2);
    assert.strictEqual(result.phases[1].name, 'phase2');
  });

  test('01.07: should remove phases in extended workflow', async () => {
    const baseWorkflow = {
      name: 'base',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
        { name: 'phase3', tasks: ['task3'] },
      ]
    };
    const extendedWorkflow = {
      name: 'extended',
      extends: 'base',
      overrides: {
        phase2: { remove: true }
      }
    };

    composer.loadWorkflow = async (name) => name === 'base' ? baseWorkflow : null;

    const result = await composer.flatten(extendedWorkflow);
    assert.strictEqual(result.phases.length, 2);
    assert.strictEqual(result.phases[0].name, 'phase1');
    assert.strictEqual(result.phases[1].name, 'phase3');
  });

  // Conditional composition
  test('01.08: should compose workflows based on condition', async () => {
    const workflow1 = { name: 'w1', phases: [{ name: 'p1', tasks: ['t1'] }] };
    const workflow2 = { name: 'w2', phases: [{ name: 'p2', tasks: ['t2'] }] };

    const composed = await composer.compose({
      strategy: 'conditional',
      workflows: [
        { workflow: workflow1, condition: (ctx) => ctx.useWorkflow1 },
        { workflow: workflow2, condition: (ctx) => ctx.useWorkflow2 },
      ],
      context: { useWorkflow1: true, useWorkflow2: false }
    });

    assert.strictEqual(composed.phases.length, 1);
    assert.strictEqual(composed.phases[0].name, 'p1');
  });

  // Merge strategies
  test('01.09: should merge overlapping phases using merge strategy', async () => {
    const workflow1 = {
      name: 'w1',
      phases: [{ name: 'shared', tasks: ['task1'] }]
    };
    const workflow2 = {
      name: 'w2',
      phases: [{ name: 'shared', tasks: ['task2'] }]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [workflow1, workflow2],
      mergeStrategy: 'combine' // Combine tasks with same phase name
    });

    assert.strictEqual(composed.phases.length, 1);
    assert.strictEqual(composed.phases[0].tasks.length, 2);
  });

  test('01.10: should use last-wins merge strategy for overlaps', async () => {
    const workflow1 = {
      name: 'w1',
      phases: [{ name: 'shared', tasks: ['task1'] }]
    };
    const workflow2 = {
      name: 'w2',
      phases: [{ name: 'shared', tasks: ['task2'] }]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [workflow1, workflow2],
      mergeStrategy: 'last-wins'
    });

    assert.strictEqual(composed.phases.length, 1);
    assert.deepStrictEqual(composed.phases[0].tasks, ['task2']);
  });

  // Parameterized composition
  test('01.11: should compose workflows with parameters', async () => {
    const template = {
      name: 'template',
      phases: [
        { name: 'process', tasks: ['{{taskName}}'] }
      ]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [template],
      parameters: { taskName: 'actual-task' }
    });

    assert.strictEqual(composed.phases[0].tasks[0], 'actual-task');
  });

  // Metadata preservation
  test('01.12: should preserve metadata during composition', async () => {
    const workflow1 = {
      name: 'w1',
      metadata: { author: 'planner', version: '1.0' },
      phases: [{ name: 'p1', tasks: ['t1'] }]
    };
    const workflow2 = {
      name: 'w2',
      metadata: { author: 'planner', version: '1.0' },
      phases: [{ name: 'p2', tasks: ['t2'] }]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [workflow1, workflow2],
      preserveMetadata: true
    });

    assert.ok(composed.metadata);
    assert.ok(composed.metadata.sources.includes('w1'));
    assert.ok(composed.metadata.sources.includes('w2'));
  });

  // Namespace isolation
  test('01.13: should isolate task namespaces when composing', async () => {
    const workflow1 = {
      name: 'w1',
      phases: [{ name: 'phase1', tasks: ['task'] }]
    };
    const workflow2 = {
      name: 'w2',
      phases: [{ name: 'phase2', tasks: ['task'] }]
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: [workflow1, workflow2],
      namespaceIsolation: true
    });

    assert.strictEqual(composed.phases[0].tasks[0], 'w1:task');
    assert.strictEqual(composed.phases[1].tasks[0], 'w2:task');
  });

  // Async loading
  test('01.14: should load workflows asynchronously during composition', async () => {
    const mainWorkflow = {
      name: 'main',
      compose: {
        strategy: 'sequential',
        workflows: ['workflow1', 'workflow2']
      }
    };

    let loadedWorkflows = [];
    composer.loadWorkflow = async (name) => {
      loadedWorkflows.push(name);
      return {
        name,
        phases: [{ name: `${name}-phase`, tasks: [`${name}-task`] }]
      };
    };

    const result = await composer.flatten(mainWorkflow);
    assert.deepStrictEqual(loadedWorkflows, ['workflow1', 'workflow2']);
    assert.strictEqual(result.phases.length, 2);
  });

  // Error recovery
  test('01.15: should handle missing sub-workflow gracefully', async () => {
    const mainWorkflow = {
      name: 'main',
      phases: [
        { include: 'non-existent-workflow' }
      ]
    };

    composer.loadWorkflow = async (name) => {
      throw new Error(`Workflow not found: ${name}`);
    };

    await assert.rejects(
      async () => composer.flatten(mainWorkflow),
      { message: /workflow.*not found/i }
    );
  });
});

// =============================================================================
// Category 2: Workflow Inheritance (15 tests)
// =============================================================================

describe('SPEC-018 Category 2: Workflow Inheritance', () => {
  let composer;

  beforeEach(() => {
    composer = new WorkflowComposer();
  });

  // Single-level inheritance
  test('02.01: should inherit phases from parent workflow', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent'
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases.length, 2);
  });

  // Multi-level inheritance
  test('02.02: should support multi-level inheritance chains', async () => {
    const grandparent = {
      name: 'grandparent',
      phases: [{ name: 'p1', tasks: ['t1'] }]
    };
    const parent = {
      name: 'parent',
      extends: 'grandparent',
      phases: [{ name: 'p2', tasks: ['t2'] }]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      phases: [{ name: 'p3', tasks: ['t3'] }]
    };

    composer.loadWorkflow = async (name) => {
      const workflows = { grandparent, parent };
      return workflows[name] || null;
    };

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases.length, 3);
  });

  // Override phase properties
  test('02.03: should override phase properties in child', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'], timeout: 5000 }
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      overrides: {
        phase1: {
          timeout: 10000 // Override timeout
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases[0].timeout, 10000);
  });

  // Add tasks to inherited phase
  test('02.04: should add tasks to inherited phase', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'] }
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      overrides: {
        phase1: {
          add: ['task2', 'task3']
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases[0].tasks.length, 3);
  });

  // Remove tasks from inherited phase
  test('02.05: should remove tasks from inherited phase', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1', 'task2', 'task3'] }
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      overrides: {
        phase1: {
          remove: ['task2']
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases[0].tasks.length, 2);
    assert.deepStrictEqual(result.phases[0].tasks, ['task1', 'task3']);
  });

  // Insert phase before/after
  test('02.06: should insert new phase before existing phase', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      phases: [
        { name: 'phase1.5', tasks: ['task1.5'], insertBefore: 'phase2' }
      ]
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases.length, 3);
    assert.strictEqual(result.phases[1].name, 'phase1.5');
  });

  test('02.07: should insert new phase after existing phase', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] },
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      phases: [
        { name: 'phase1.5', tasks: ['task1.5'], insertAfter: 'phase1' }
      ]
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.phases.length, 3);
    assert.strictEqual(result.phases[1].name, 'phase1.5');
  });

  // Replace entire phase
  test('02.08: should replace entire phase in child', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      overrides: {
        phase1: {
          replace: { name: 'phase1', tasks: ['replacement-task'] }
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.deepStrictEqual(result.phases[0].tasks, ['replacement-task']);
  });

  // Inherit metadata
  test('02.09: should inherit metadata from parent', async () => {
    const parent = {
      name: 'parent',
      metadata: { author: 'planner', version: '1.0' },
      phases: []
    };
    const child = {
      name: 'child',
      extends: 'parent',
      metadata: { version: '1.1' }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.metadata.author, 'planner');
    assert.strictEqual(result.metadata.version, '1.1'); // Child overrides
  });

  // Override validation rules
  test('02.10: should override validation rules in child', async () => {
    const parent = {
      name: 'parent',
      validation: { minPhases: 2 },
      phases: [{ name: 'p1', tasks: ['t1'] }]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      validation: { minPhases: 1 }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.strictEqual(result.validation.minPhases, 1);
  });

  // Abstract workflows (cannot execute directly)
  test('02.11: should prevent execution of abstract parent workflows', async () => {
    const parent = {
      name: 'parent',
      abstract: true,
      phases: [{ name: 'p1', tasks: ['{{task}}'] }]
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const validator = new WorkflowValidator();
    await assert.rejects(
      async () => validator.validateForExecution(parent),
      { message: /abstract.*cannot.*execute/i }
    );
  });

  // Conflict resolution
  test('02.12: should resolve conflicts when child and parent define same phase', async () => {
    const parent = {
      name: 'parent',
      phases: [{ name: 'phase1', tasks: ['parent-task'] }]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      phases: [{ name: 'phase1', tasks: ['child-task'] }]
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    // Child definition should win
    assert.strictEqual(result.phases[0].tasks[0], 'child-task');
  });

  // Dependency inheritance
  test('02.13: should inherit dependencies from parent', async () => {
    const parent = {
      name: 'parent',
      dependencies: ['dependency1'],
      phases: []
    };
    const child = {
      name: 'child',
      extends: 'parent',
      dependencies: ['dependency2']
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.ok(result.dependencies.includes('dependency1'));
    assert.ok(result.dependencies.includes('dependency2'));
  });

  // Hook inheritance
  test('02.14: should inherit hooks from parent', async () => {
    const parent = {
      name: 'parent',
      hooks: { beforePhase: ['hook1'] },
      phases: []
    };
    const child = {
      name: 'child',
      extends: 'parent',
      hooks: { afterPhase: ['hook2'] }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const result = await composer.flatten(child);
    assert.ok(result.hooks.beforePhase.includes('hook1'));
    assert.ok(result.hooks.afterPhase.includes('hook2'));
  });

  // Diamond inheritance problem
  test('02.15: should handle diamond inheritance pattern', async () => {
    const grandparent = {
      name: 'grandparent',
      phases: [{ name: 'p1', tasks: ['t1'] }]
    };
    const parent1 = {
      name: 'parent1',
      extends: 'grandparent',
      phases: [{ name: 'p2', tasks: ['t2'] }]
    };
    const parent2 = {
      name: 'parent2',
      extends: 'grandparent',
      phases: [{ name: 'p3', tasks: ['t3'] }]
    };
    const child = {
      name: 'child',
      extends: ['parent1', 'parent2'] // Multiple inheritance
    };

    composer.loadWorkflow = async (name) => {
      const workflows = { grandparent, parent1, parent2 };
      return workflows[name] || null;
    };

    const result = await composer.flatten(child);
    // Should include p1 only once (from grandparent)
    const phaseNames = result.phases.map(p => p.name);
    assert.strictEqual(phaseNames.filter(n => n === 'p1').length, 1);
  });
});

// =============================================================================
// Category 3: Cycle Detection (15 tests)
// =============================================================================

describe('SPEC-018 Category 3: Cycle Detection', () => {
  let detector;

  beforeEach(() => {
    detector = new CycleDetector();
  });

  // Direct circular reference
  test('03.01: should detect direct circular reference', async () => {
    const workflow = {
      name: 'workflow1',
      includes: ['workflow1'] // Self-reference
    };

    await assert.rejects(
      async () => detector.detectCycles(workflow, new Map([[workflow.name, workflow]])),
      { message: /circular.*dependency/i }
    );
  });

  // Two-node cycle
  test('03.02: should detect two-node cycle', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2']
    };
    const workflow2 = {
      name: 'workflow2',
      includes: ['workflow1']
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Three-node cycle
  test('03.03: should detect three-node cycle', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2']
    };
    const workflow2 = {
      name: 'workflow2',
      includes: ['workflow3']
    };
    const workflow3 = {
      name: 'workflow3',
      includes: ['workflow1']
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2],
      ['workflow3', workflow3]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Long chain without cycle
  test('03.04: should not detect cycle in long chain', async () => {
    const workflows = Array.from({ length: 10 }, (_, i) => ({
      name: `workflow${i}`,
      includes: i < 9 ? [`workflow${i + 1}`] : []
    }));

    const registry = new Map(workflows.map(w => [w.name, w]));

    await assert.doesNotReject(
      async () => detector.detectCycles(workflows[0], registry)
    );
  });

  // Multiple includes (no cycle)
  test('03.05: should handle multiple includes without cycle', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2', 'workflow3']
    };
    const workflow2 = {
      name: 'workflow2',
      includes: ['workflow4']
    };
    const workflow3 = {
      name: 'workflow3',
      includes: ['workflow4']
    };
    const workflow4 = {
      name: 'workflow4',
      includes: []
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2],
      ['workflow3', workflow3],
      ['workflow4', workflow4]
    ]);

    await assert.doesNotReject(
      async () => detector.detectCycles(workflow1, registry)
    );
  });

  // Diamond dependency (no cycle)
  test('03.06: should handle diamond dependency without cycle', async () => {
    const top = {
      name: 'top',
      includes: ['left', 'right']
    };
    const left = {
      name: 'left',
      includes: ['bottom']
    };
    const right = {
      name: 'right',
      includes: ['bottom']
    };
    const bottom = {
      name: 'bottom',
      includes: []
    };

    const registry = new Map([
      ['top', top],
      ['left', left],
      ['right', right],
      ['bottom', bottom]
    ]);

    await assert.doesNotReject(
      async () => detector.detectCycles(top, registry)
    );
  });

  // Cycle in inheritance
  test('03.07: should detect cycle in extends chain', async () => {
    const workflow1 = {
      name: 'workflow1',
      extends: 'workflow2'
    };
    const workflow2 = {
      name: 'workflow2',
      extends: 'workflow1'
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Mixed includes and extends (with cycle)
  test('03.08: should detect cycle in mixed includes and extends', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2']
    };
    const workflow2 = {
      name: 'workflow2',
      extends: 'workflow3'
    };
    const workflow3 = {
      name: 'workflow3',
      includes: ['workflow1']
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2],
      ['workflow3', workflow3]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Cycle path reporting
  test('03.09: should report the cycle path', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2']
    };
    const workflow2 = {
      name: 'workflow2',
      includes: ['workflow3']
    };
    const workflow3 = {
      name: 'workflow3',
      includes: ['workflow1']
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2],
      ['workflow3', workflow3]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      (err) => {
        assert.ok(err.message.includes('workflow1'));
        assert.ok(err.message.includes('workflow2'));
        assert.ok(err.message.includes('workflow3'));
        return true;
      }
    );
  });

  // Empty workflow
  test('03.10: should not detect cycle in workflow without dependencies', async () => {
    const workflow = {
      name: 'workflow1',
      phases: []
    };

    await assert.doesNotReject(
      async () => detector.detectCycles(workflow, new Map([[workflow.name, workflow]]))
    );
  });

  // Cycle through composition
  test('03.11: should detect cycle through compose property', async () => {
    const workflow1 = {
      name: 'workflow1',
      compose: { workflows: ['workflow2'] }
    };
    const workflow2 = {
      name: 'workflow2',
      compose: { workflows: ['workflow1'] }
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Performance with large graphs
  test('03.12: should handle large dependency graphs efficiently', async () => {
    // Create 100 workflows in chain without cycle
    const workflows = Array.from({ length: 100 }, (_, i) => ({
      name: `workflow${i}`,
      includes: i < 99 ? [`workflow${i + 1}`] : []
    }));

    const registry = new Map(workflows.map(w => [w.name, w]));

    const startTime = Date.now();
    await detector.detectCycles(workflows[0], registry);
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed < 100, `Cycle detection took ${elapsed}ms (expected <100ms)`);
  });

  // Multiple cycles
  test('03.13: should detect first cycle encountered', async () => {
    // Two separate cycles in same graph
    const workflow1 = {
      name: 'workflow1',
      includes: ['workflow2', 'workflow4']
    };
    const workflow2 = {
      name: 'workflow2',
      includes: ['workflow1'] // Cycle 1
    };
    const workflow4 = {
      name: 'workflow4',
      includes: ['workflow5']
    };
    const workflow5 = {
      name: 'workflow5',
      includes: ['workflow4'] // Cycle 2
    };

    const registry = new Map([
      ['workflow1', workflow1],
      ['workflow2', workflow2],
      ['workflow4', workflow4],
      ['workflow5', workflow5]
    ]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /circular.*dependency/i }
    );
  });

  // Visited node optimization
  test('03.14: should not revisit already validated nodes', async () => {
    // Diamond pattern where bottom is referenced twice
    const top = {
      name: 'top',
      includes: ['left', 'right']
    };
    const left = {
      name: 'left',
      includes: ['bottom']
    };
    const right = {
      name: 'right',
      includes: ['bottom']
    };
    const bottom = {
      name: 'bottom',
      includes: []
    };

    const registry = new Map([
      ['top', top],
      ['left', left],
      ['right', right],
      ['bottom', bottom]
    ]);

    let visitCount = 0;
    const originalDetect = detector.detectCycles.bind(detector);
    detector.detectCycles = async (workflow, reg, visited = new Set()) => {
      visitCount++;
      return originalDetect(workflow, reg, visited);
    };

    await detector.detectCycles(top, registry);
    // Should visit each node at most once
    assert.ok(visitCount <= 4);
  });

  // Missing workflow reference
  test('03.15: should handle missing workflow reference gracefully', async () => {
    const workflow1 = {
      name: 'workflow1',
      includes: ['non-existent-workflow']
    };

    const registry = new Map([['workflow1', workflow1]]);

    await assert.rejects(
      async () => detector.detectCycles(workflow1, registry),
      { message: /workflow.*not found/i }
    );
  });
});

// =============================================================================
// Category 4: Hierarchy Flattening (15 tests)
// =============================================================================

describe('SPEC-018 Category 4: Hierarchy Flattening', () => {
  let composer;

  beforeEach(() => {
    composer = new WorkflowComposer();
  });

  // Basic flattening
  test('04.01: should flatten nested workflow to single level', async () => {
    const workflow = {
      name: 'nested',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        {
          name: 'phase2',
          subphases: [
            { name: 'phase2.1', tasks: ['task2.1'] },
            { name: 'phase2.2', tasks: ['task2.2'] },
          ]
        },
        { name: 'phase3', tasks: ['task3'] },
      ]
    };

    const flattened = await composer.flatten(workflow);
    assert.ok(flattened.phases.every(p => !p.subphases));
  });

  // Preserve execution order
  test('04.02: should preserve execution order when flattening', async () => {
    const workflow = {
      name: 'ordered',
      phases: [
        { name: 'p1', tasks: ['t1'] },
        {
          name: 'p2',
          subphases: [
            { name: 'p2.1', tasks: ['t2.1'] },
            { name: 'p2.2', tasks: ['t2.2'] },
          ]
        },
        { name: 'p3', tasks: ['t3'] },
      ]
    };

    const flattened = await composer.flatten(workflow);
    const phaseNames = flattened.phases.map(p => p.name);
    assert.strictEqual(phaseNames[0], 'p1');
    assert.strictEqual(phaseNames[3], 'p3');
  });

  // Resolve all includes
  test('04.03: should resolve all includes during flattening', async () => {
    const main = {
      name: 'main',
      phases: [
        { include: 'sub1' },
        { include: 'sub2' },
      ]
    };
    const sub1 = {
      name: 'sub1',
      phases: [{ name: 'sub1-phase', tasks: ['sub1-task'] }]
    };
    const sub2 = {
      name: 'sub2',
      phases: [{ name: 'sub2-phase', tasks: ['sub2-task'] }]
    };

    composer.loadWorkflow = async (name) => {
      const workflows = { sub1, sub2 };
      return workflows[name] || null;
    };

    const flattened = await composer.flatten(main);
    assert.strictEqual(flattened.phases.length, 2);
    assert.ok(!flattened.phases.some(p => p.include));
  });

  // Apply all overrides
  test('04.04: should apply all overrides during flattening', async () => {
    const parent = {
      name: 'parent',
      phases: [
        { name: 'phase1', tasks: ['task1'], timeout: 5000 }
      ]
    };
    const child = {
      name: 'child',
      extends: 'parent',
      overrides: {
        phase1: {
          timeout: 10000,
          add: ['task2']
        }
      }
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const flattened = await composer.flatten(child);
    assert.strictEqual(flattened.phases[0].timeout, 10000);
    assert.strictEqual(flattened.phases[0].tasks.length, 2);
  });

  // Validate phase dependencies
  test('04.05: should validate phase dependencies after flattening', async () => {
    const workflow = {
      name: 'dependent',
      phases: [
        { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] },
        { name: 'phase1', tasks: ['task1'] },
      ]
    };

    const flattened = await composer.flatten(workflow);
    const validator = new WorkflowValidator();
    await assert.doesNotReject(
      async () => validator.validateDependencies(flattened)
    );
  });

  // Normalize task references
  test('04.06: should normalize task references after flattening', async () => {
    const workflow = {
      name: 'with-refs',
      phases: [
        { name: 'phase1', tasks: ['{{baseTask}}-1'] },
        { name: 'phase2', tasks: ['{{baseTask}}-2'] },
      ],
      variables: { baseTask: 'process' }
    };

    const flattened = await composer.flatten(workflow);
    assert.strictEqual(flattened.phases[0].tasks[0], 'process-1');
    assert.strictEqual(flattened.phases[1].tasks[0], 'process-2');
  });

  // Remove duplicate phases
  test('04.07: should remove duplicate phases after flattening', async () => {
    const workflow = {
      name: 'duplicates',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase1', tasks: ['task1'] }, // Duplicate
        { name: 'phase2', tasks: ['task2'] },
      ]
    };

    const flattened = await composer.flatten(workflow, { deduplicatePhases: true });
    assert.strictEqual(flattened.phases.length, 2);
  });

  // Merge metadata
  test('04.08: should merge metadata from all sources', async () => {
    const parent = {
      name: 'parent',
      metadata: { author: 'planner', created: '2026-01-01' },
      phases: []
    };
    const child = {
      name: 'child',
      extends: 'parent',
      metadata: { version: '1.0', updated: '2026-01-30' },
      phases: []
    };

    composer.loadWorkflow = async (name) => name === 'parent' ? parent : null;

    const flattened = await composer.flatten(child);
    assert.strictEqual(flattened.metadata.author, 'planner');
    assert.strictEqual(flattened.metadata.version, '1.0');
    assert.strictEqual(flattened.metadata.created, '2026-01-01');
    assert.strictEqual(flattened.metadata.updated, '2026-01-30');
  });

  // Flatten recursively
  test('04.09: should flatten recursive includes', async () => {
    const main = {
      name: 'main',
      phases: [{ include: 'level1' }]
    };
    const level1 = {
      name: 'level1',
      phases: [{ include: 'level2' }]
    };
    const level2 = {
      name: 'level2',
      phases: [{ name: 'deep', tasks: ['deep-task'] }]
    };

    composer.loadWorkflow = async (name) => {
      const workflows = { level1, level2 };
      return workflows[name] || null;
    };

    const flattened = await composer.flatten(main);
    assert.strictEqual(flattened.phases[0].name, 'deep');
  });

  // Preserve hooks
  test('04.10: should preserve hooks during flattening', async () => {
    const workflow = {
      name: 'with-hooks',
      hooks: { beforePhase: ['hook1'] },
      phases: [{ name: 'phase1', tasks: ['task1'] }]
    };

    const flattened = await composer.flatten(workflow);
    assert.deepStrictEqual(flattened.hooks.beforePhase, ['hook1']);
  });

  // Resolve variables
  test('04.11: should resolve all variables during flattening', async () => {
    const workflow = {
      name: 'with-vars',
      variables: { env: 'production', region: 'us-east-1' },
      phases: [
        { name: 'deploy', tasks: ['deploy-{{env}}-{{region}}'] }
      ]
    };

    const flattened = await composer.flatten(workflow);
    assert.strictEqual(flattened.phases[0].tasks[0], 'deploy-production-us-east-1');
  });

  // Calculate total tasks
  test('04.12: should calculate total tasks after flattening', async () => {
    const workflow = {
      name: 'counted',
      phases: [
        { name: 'phase1', tasks: ['task1', 'task2'] },
        { name: 'phase2', tasks: ['task3'] },
        { name: 'phase3', tasks: ['task4', 'task5', 'task6'] },
      ]
    };

    const flattened = await composer.flatten(workflow);
    assert.strictEqual(flattened.totalTasks, 6);
  });

  // Build execution plan
  test('04.13: should build execution plan during flattening', async () => {
    const workflow = {
      name: 'executable',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] },
      ]
    };

    const flattened = await composer.flatten(workflow, { buildExecutionPlan: true });
    assert.ok(flattened.executionPlan);
    assert.strictEqual(flattened.executionPlan.length, 2);
  });

  // Optimize phase order
  test('04.14: should optimize phase order for parallel execution', async () => {
    const workflow = {
      name: 'parallelizable',
      phases: [
        { name: 'phase1', tasks: ['task1'] },
        { name: 'phase2', tasks: ['task2'] }, // No dependency
        { name: 'phase3', tasks: ['task3'], dependsOn: ['phase1'] },
      ]
    };

    const flattened = await composer.flatten(workflow, { optimizeOrder: true });
    // phase1 and phase2 should be marked as parallelizable
    const parallelPhases = flattened.phases.filter(p => p.parallel);
    assert.ok(parallelPhases.length >= 2);
  });

  // Cache flattened result
  test('04.15: should cache flattened workflow for reuse', async () => {
    const workflow = {
      name: 'cacheable',
      phases: [{ name: 'phase1', tasks: ['task1'] }]
    };

    const flattened1 = await composer.flatten(workflow, { cache: true });
    const flattened2 = await composer.flatten(workflow, { cache: true });

    // Should return same reference from cache
    assert.strictEqual(flattened1, flattened2);
  });
});

// =============================================================================
// Category 5: Validation & Error Handling (10 tests)
// =============================================================================

describe('SPEC-018 Category 5: Validation & Error Handling', () => {
  let validator;
  let composer;

  beforeEach(() => {
    validator = new WorkflowValidator();
    composer = new WorkflowComposer();
  });

  test('05.01: should validate workflow structure', async () => {
    const invalid = {
      // Missing name
      phases: [{ name: 'phase1', tasks: ['task1'] }]
    };

    await assert.rejects(
      async () => validator.validate(invalid),
      { message: /missing.*name/i }
    );
  });

  test('05.02: should validate phase structure', async () => {
    const workflow = {
      name: 'invalid-phase',
      phases: [
        { tasks: ['task1'] } // Missing name
      ]
    };

    await assert.rejects(
      async () => validator.validate(workflow),
      { message: /phase.*missing.*name/i }
    );
  });

  test('05.03: should validate task references exist', async () => {
    const workflow = {
      name: 'invalid-ref',
      phases: [
        { name: 'phase1', tasks: ['{{undefinedVar}}'] }
      ]
    };

    await assert.rejects(
      async () => validator.validate(workflow),
      { message: /undefined.*variable/i }
    );
  });

  test('05.04: should validate dependencies are satisfied', async () => {
    const workflow = {
      name: 'invalid-dep',
      phases: [
        { name: 'phase1', tasks: ['task1'], dependsOn: ['non-existent-phase'] }
      ]
    };

    await assert.rejects(
      async () => validator.validateDependencies(workflow),
      { message: /dependency.*not found/i }
    );
  });

  test('05.05: should prevent circular dependencies in phases', async () => {
    const workflow = {
      name: 'circular-phases',
      phases: [
        { name: 'phase1', tasks: ['task1'], dependsOn: ['phase2'] },
        { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] }
      ]
    };

    await assert.rejects(
      async () => validator.validateDependencies(workflow),
      { message: /circular.*dependency/i }
    );
  });

  test('05.06: should validate maximum nesting depth', async () => {
    const workflow = {
      name: 'too-deep',
      phases: [
        {
          name: 'p1',
          subphases: [
            {
              name: 'p1.1',
              subphases: [
                {
                  name: 'p1.1.1',
                  subphases: [
                    { name: 'p1.1.1.1', tasks: ['task'] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    await assert.rejects(
      async () => validator.validate(workflow, { maxNestingDepth: 3 }),
      { message: /nesting.*depth.*exceeded/i }
    );
  });

  test('05.07: should validate workflow has at least one phase', async () => {
    const workflow = {
      name: 'empty',
      phases: []
    };

    await assert.rejects(
      async () => validator.validate(workflow),
      { message: /at least one phase/i }
    );
  });

  test('05.08: should validate phase has at least one task', async () => {
    const workflow = {
      name: 'empty-phase',
      phases: [
        { name: 'phase1', tasks: [] }
      ]
    };

    await assert.rejects(
      async () => validator.validate(workflow),
      { message: /at least one task/i }
    );
  });

  test('05.09: should provide helpful error messages', async () => {
    const workflow = {
      name: 'bad-workflow',
      phases: [
        { name: 'phase1', tasks: ['{{undefined}}'] }
      ]
    };

    try {
      await validator.validate(workflow);
      assert.fail('Should have thrown');
    } catch (error) {
      assert.ok(error.message.includes('phase1'));
      assert.ok(error.message.includes('undefined'));
    }
  });

  test('05.10: should validate after composition', async () => {
    const workflow1 = {
      name: 'w1',
      phases: [{ name: 'phase1', tasks: ['task1'] }]
    };
    const workflow2 = {
      name: 'w2',
      phases: [{ name: 'phase2', tasks: [] }] // Invalid: no tasks
    };

    composer.loadWorkflow = async (name) => {
      const workflows = { w1: workflow1, w2: workflow2 };
      return workflows[name];
    };

    const composed = await composer.compose({
      strategy: 'sequential',
      workflows: ['w1', 'w2']
    });

    await assert.rejects(
      async () => validator.validate(composed),
      { message: /at least one task/i }
    );
  });
});
