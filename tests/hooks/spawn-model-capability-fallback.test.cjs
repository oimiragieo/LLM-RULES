'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  resolveSelectedModel,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.runtime-support.cjs');

describe('spawn model capability fallback', () => {
  it('falls back from haiku to sonnet when WebSearch is requested', () => {
    const selected = resolveSelectedModel(
      {
        model: 'haiku',
        allowed_tools: ['Read', 'WebSearch', 'TaskUpdate'],
      },
      null,
      'task-1',
      'researcher'
    );
    assert.equal(selected, 'sonnet');
  });

  it('falls back from haiku to sonnet when WebFetch is requested', () => {
    const selected = resolveSelectedModel(
      {
        model: 'haiku',
        allowed_tools: ['Read', 'WebFetch', 'TaskUpdate'],
      },
      null,
      'task-2',
      'researcher'
    );
    assert.equal(selected, 'sonnet');
  });

  it('falls back from haiku to sonnet when Skill is requested', () => {
    const selected = resolveSelectedModel(
      {
        model: 'haiku',
        allowed_tools: ['Read', 'Skill', 'TaskUpdate'],
      },
      null,
      'task-4',
      'developer'
    );
    assert.equal(selected, 'sonnet');
  });

  it('falls back from haiku to sonnet when TaskCreate is requested', () => {
    const selected = resolveSelectedModel(
      {
        model: 'haiku',
        allowed_tools: ['Read', 'TaskCreate', 'TaskUpdate'],
      },
      null,
      'task-5',
      'planner'
    );
    assert.equal(selected, 'sonnet');
  });

  it('keeps configured model when no web tools are requested', () => {
    const selected = resolveSelectedModel(
      {
        model: 'haiku',
        allowed_tools: ['Read', 'Write', 'TaskUpdate'],
      },
      null,
      'task-3',
      'developer'
    );
    assert.equal(selected, 'haiku');
  });
});
