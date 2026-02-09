/**
 * Phase 4 / SPEC-018: Workflow composition tests
 * include, extend, compose, flatten, override merge
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowComposer } = require('../../.claude/lib/workflow/workflow-composer.cjs');
const { WorkflowResolver } = require('../../.claude/lib/workflow/workflow-resolver.cjs');

describe('Phase 4: workflow composition', () => {
  let composer;
  let resolver;

  beforeEach(() => {
    composer = new WorkflowComposer();
    resolver = new WorkflowResolver();
  });

  test('include returns reference object', () => {
    const ref = composer.include('sub-workflow');
    assert.strictEqual(ref.type, 'include');
    assert.strictEqual(ref.workflow, 'sub-workflow');
  });

  test('extend merges base with overrides (add task)', () => {
    const base = { name: 'base', phases: [{ name: 'phase1', tasks: ['unit-tests'] }] };
    const overrides = { phase1: { add: [{ after: 'unit-tests', task: 'integration-tests' }] } };
    const result = composer.extend(base, overrides);
    assert.ok(result.phases.length >= 1);
    const phase1 = result.phases.find(p => p.name === 'phase1' || (p.tasks && p.tasks.length));
    assert.ok(phase1 && phase1.tasks && phase1.tasks.length >= 2);
  });

  test('extend with remove', () => {
    const base = { name: 'b', phases: [{ name: 'p1', tasks: ['a', 'b', 'c'] }] };
    const overrides = { p1: { remove: ['b'] } };
    const result = composer.extend(base, overrides);
    const p1 = result.phases.find(p => p.tasks && p.tasks.includes('a'));
    assert.ok(p1);
    assert.ok(!p1.tasks.includes('b'));
  });

  test('compose returns composed def', () => {
    const workflows = ['wf-a', 'wf-b'];
    const result = composer.compose(workflows, 'sequential');
    assert.strictEqual(result.type, 'composed');
    assert.strictEqual(result.strategy, 'sequential');
    assert.deepStrictEqual(result.workflows, ['wf-a', 'wf-b']);
  });

  test('flatten resolves and returns phases', async () => {
    const registry = new Map();
    registry.set('root', { name: 'root', phases: [{ name: 'phase1', tasks: ['t1'] }] });
    resolver.setRegistry(registry);

    const flat = await composer.flatten('root', resolver, { maxDepth: 10 });
    assert.strictEqual(flat.name, 'root');
    assert.strictEqual(flat.phases.length, 1);
    assert.strictEqual(flat.phases[0].name, 'phase1');
  });

  test('flatten with include expands sub-workflow', async () => {
    const registry = new Map();
    registry.set('root', {
      name: 'root',
      phases: [{ name: 'before' }, { include: 'sub' }, { name: 'after' }],
    });
    registry.set('sub', { name: 'sub', phases: [{ name: 'subPhase' }] });
    resolver.setRegistry(registry);

    const flat = await composer.flatten('root', resolver, { maxDepth: 10 });
    assert.ok(flat.phases.length >= 2);
    const names = flat.phases.map(p => p.name);
    assert.ok(names.includes('subPhase'));
  });

  test('flatten respects maxDepth', async () => {
    const registry = new Map();
    registry.set('a', { name: 'a', phases: [{ include: 'b' }] });
    registry.set('b', { name: 'b', phases: [{ include: 'c' }] });
    registry.set('c', { name: 'c', phases: [{ include: 'd' }] });
    registry.set('d', { name: 'd', phases: [{ include: 'e' }] });
    registry.set('e', { name: 'e', phases: [{ name: 'deep' }] });
    resolver.setRegistry(registry);

    await assert.rejects(async () => composer.flatten('a', resolver, { maxDepth: 3 }), {
      message: /depth exceeded|maxDepth/,
    });
  });

  test('extend empty overrides returns copy of base', () => {
    const base = { name: 'x', phases: [{ name: 'p1' }] };
    const result = composer.extend(base, {});
    assert.strictEqual(result.phases.length, 1);
    assert.strictEqual(result.name, 'x');
  });

  test('compose with object refs', () => {
    const wfA = { name: 'a', phases: [] };
    const wfB = { name: 'b', phases: [] };
    const result = composer.compose([wfA, wfB], 'parallel');
    assert.strictEqual(result.strategy, 'parallel');
    assert.ok(result.workflows.includes('a') && result.workflows.includes('b'));
  });

  test('getDependencies from resolver', () => {
    const workflow = { name: 'w', extends: 'base', includes: ['sub1'] };
    const deps = resolver.getDependencies(workflow);
    assert.ok(deps.includes('base'));
    assert.ok(deps.includes('sub1'));
  });

  test('getDependencies from phases with include', () => {
    const workflow = { name: 'w', phases: [{ name: 'p1' }, { include: 'sub2' }] };
    const deps = resolver.getDependencies(workflow);
    assert.ok(deps.includes('sub2'));
  });

  test('resolve caches result', async () => {
    const registry = new Map();
    registry.set('cached', { name: 'cached' });
    resolver.setRegistry(registry);
    const a = await resolver.resolve('cached');
    const b = await resolver.resolve('cached');
    assert.strictEqual(a, b);
  });
});
