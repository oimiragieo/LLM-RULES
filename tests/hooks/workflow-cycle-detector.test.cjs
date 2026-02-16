'use strict';

const { CycleDetector } = require('../../.claude/lib/workflow/cycle-detector.cjs');
const assert = require('assert');
const test = require('node:test');

test('CycleDetector', async t => {
  const detector = new CycleDetector();

  await t.test('should allow a workflow with no dependencies', async () => {
    const workflow = { name: 'wf1' };
    const registry = new Map([['wf1', workflow]]);
    await detector.detectCycles(workflow, registry);
    // Should not throw
  });

  await t.test('should allow normal linear progression', async () => {
    const registry = new Map([
      ['wf1', { name: 'wf1', extends: 'wf2' }],
      ['wf2', { name: 'wf2', includes: 'wf3' }],
      ['wf3', { name: 'wf3' }],
    ]);
    await detector.detectCycles(registry.get('wf1'), registry);
    // Should not throw
  });

  await t.test('should detect direct cycle (A -> A)', async () => {
    const workflow = { name: 'wf1', extends: 'wf1' };
    const registry = new Map([['wf1', workflow]]);

    await assert.rejects(
      detector.detectCycles(workflow, registry),
      /Circular dependency detected: wf1 -> wf1/
    );
  });

  await t.test('should detect indirect cycle (A -> B -> A)', async () => {
    const registry = new Map([
      ['wf1', { name: 'wf1', extends: 'wf2' }],
      ['wf2', { name: 'wf2', includes: 'wf1' }],
    ]);

    await assert.rejects(
      detector.detectCycles(registry.get('wf1'), registry),
      /Circular dependency detected: wf1 -> wf2 -> wf1/
    );
  });

  await t.test('should detect cycle in phase includes', async () => {
    const registry = new Map([
      ['wf1', { name: 'wf1', phases: [{ include: 'wf2' }] }],
      ['wf2', { name: 'wf2', extends: 'wf1' }],
    ]);

    await assert.rejects(
      detector.detectCycles(registry.get('wf1'), registry),
      /Circular dependency detected: wf1 -> wf2 -> wf1/
    );
  });

  await t.test('should detect cycle in composition', async () => {
    const registry = new Map([
      ['wf1', { name: 'wf1', compose: { workflows: ['wf2'] } }],
      ['wf2', { name: 'wf2', compose: { workflows: [{ workflow: 'wf1' }] } }],
    ]);

    await assert.rejects(
      detector.detectCycles(registry.get('wf1'), registry),
      /Circular dependency detected: wf1 -> wf2 -> wf1/
    );
  });

  await t.test('should throw if dependency is missing from registry', async () => {
    const workflow = { name: 'wf1', extends: 'missing' };
    const registry = new Map([['wf1', workflow]]);

    await assert.rejects(
      detector.detectCycles(workflow, registry),
      /Workflow 'missing' not found in registry/
    );
  });

  await t.test('should throw when max depth is exceeded', async () => {
    // Linear chain of 5
    const registry = new Map([
      ['wf1', { name: 'wf1', extends: 'wf2' }],
      ['wf2', { name: 'wf2', extends: 'wf3' }],
      ['wf3', { name: 'wf3', extends: 'wf4' }],
      ['wf4', { name: 'wf4', extends: 'wf5' }],
      ['wf5', { name: 'wf5' }],
    ]);

    await assert.rejects(
      detector.detectCycles(registry.get('wf1'), registry, new Set(), { maxDepth: 3 }),
      /Workflow composition depth exceeded 3: wf1 -> wf2 -> wf3 -> wf4/
    );
  });
});
