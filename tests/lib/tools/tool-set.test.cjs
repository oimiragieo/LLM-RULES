'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const { ToolSet, getManifest, isCanEdit } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'tools', 'tool-set.cjs')
);

test('ToolSet.default(router) excludes editing tools', () => {
  const toolSet = ToolSet.default('router');
  const tools = toolSet.getToolNames();
  assert.ok(tools.length > 0, 'router toolset should not be empty');
  const editing = tools.filter(tool => isCanEdit(tool));
  assert.strictEqual(
    editing.length,
    0,
    `router toolset should not include editing tools: ${editing.join(', ')}`
  );
});

test('ToolSet.default(developer) includes editing tools', () => {
  const toolSet = ToolSet.default('developer');
  assert.ok(toolSet.includes('Write'), 'developer should include Write');
  assert.ok(toolSet.includes('Edit'), 'developer should include Edit');
  assert.ok(toolSet.includes('Bash'), 'developer should include Bash');
});

test('ToolSet.apply respects fixed_tools and ignores unknown tools', () => {
  const toolSet = ToolSet.default('developer').apply({
    fixed_tools: ['Read', 'UnknownTool', 'TaskList'],
  });
  const tools = toolSet.getToolNames();
  assert.deepStrictEqual(tools.sort(), ['Read', 'TaskList'].sort());
});

test('ToolSet.withoutEditingTools removes canEdit tools', () => {
  const toolSet = ToolSet.default('developer').withoutEditingTools();
  const tools = toolSet.getToolNames();
  const manifest = getManifest();
  const canEditTools = (manifest.tools?.core || [])
    .filter(tool => tool.canEdit === true)
    .map(tool => tool.name);
  const overlap = tools.filter(tool => canEditTools.includes(tool));
  assert.strictEqual(
    overlap.length,
    0,
    `read-only toolset should exclude editing tools: ${overlap.join(', ')}`
  );
});
