'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CodebaseMapper,
  CATEGORY_AGENT,
  CATEGORY_SKILL,
  CATEGORY_HOOK,
  CATEGORY_LIB,
  CATEGORY_TEST,
  CATEGORY_SCHEMA,
  CATEGORY_CONFIG,
  CATEGORY_OTHER,
} = require('../../.claude/lib/discovery/codebase-mapper.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  it('exports all category strings', () => {
    assert.equal(CATEGORY_AGENT, 'agent');
    assert.equal(CATEGORY_SKILL, 'skill');
    assert.equal(CATEGORY_HOOK, 'hook');
    assert.equal(CATEGORY_LIB, 'lib');
    assert.equal(CATEGORY_TEST, 'test');
    assert.equal(CATEGORY_SCHEMA, 'schema');
    assert.equal(CATEGORY_CONFIG, 'config');
    assert.equal(CATEGORY_OTHER, 'other');
  });
});

// ─── categorizeFile ─────────────────────────────────────────────────────────

describe('categorizeFile', () => {
  it('categorizes agent files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/agents/core/developer.md'), CATEGORY_AGENT);
    assert.equal(mapper.categorizeFile('.claude/agents/domain/python-pro.md'), CATEGORY_AGENT);
  });

  it('categorizes skill files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/skills/tdd/SKILL.md'), CATEGORY_SKILL);
  });

  it('categorizes hook files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/hooks/routing/routing-guard.cjs'), CATEGORY_HOOK);
  });

  it('categorizes lib files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/lib/routing/trust-scorer.cjs'), CATEGORY_LIB);
  });

  it('categorizes test files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('tests/lib/trust-scorer.test.cjs'), CATEGORY_TEST);
  });

  it('categorizes schema files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/schemas/task-output.schema.json'), CATEGORY_SCHEMA);
  });

  it('categorizes config files', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude/config/capability-routing.json'), CATEGORY_CONFIG);
  });

  it('returns OTHER for unknown paths', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('random/file.txt'), CATEGORY_OTHER);
  });

  it('normalizes backslash paths', () => {
    const mapper = new CodebaseMapper();
    assert.equal(mapper.categorizeFile('.claude\\agents\\core\\developer.md'), CATEGORY_AGENT);
  });
});

// ─── registerFile ───────────────────────────────────────────────────────────

describe('registerFile', () => {
  it('registers a file with auto-categorization', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/developer.md');
    const map = mapper.getMap();
    assert.ok(map.agent.includes('.claude/agents/core/developer.md'));
  });

  it('registers multiple files', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/developer.md');
    mapper.registerFile('.claude/agents/core/qa.md');
    const map = mapper.getMap();
    assert.equal(map.agent.length, 2);
  });

  it('deduplicates registrations', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/developer.md');
    mapper.registerFile('.claude/agents/core/developer.md');
    const map = mapper.getMap();
    assert.equal(map.agent.length, 1);
  });

  it('accepts explicit category override', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('some/custom/path.txt', CATEGORY_CONFIG);
    const map = mapper.getMap();
    assert.ok(map.config.includes('some/custom/path.txt'));
  });
});

// ─── getMap ─────────────────────────────────────────────────────────────────

describe('getMap', () => {
  it('returns object with all categories', () => {
    const mapper = new CodebaseMapper();
    const map = mapper.getMap();
    assert.ok('agent' in map);
    assert.ok('skill' in map);
    assert.ok('hook' in map);
    assert.ok('lib' in map);
    assert.ok('test' in map);
    assert.ok('schema' in map);
    assert.ok('config' in map);
    assert.ok('other' in map);
  });

  it('returns empty arrays for empty mapper', () => {
    const mapper = new CodebaseMapper();
    const map = mapper.getMap();
    for (const category of Object.values(map)) {
      assert.ok(Array.isArray(category));
      assert.equal(category.length, 0);
    }
  });
});

// ─── getSummary ─────────────────────────────────────────────────────────────

describe('getSummary', () => {
  it('returns counts per category', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/developer.md');
    mapper.registerFile('.claude/agents/core/qa.md');
    mapper.registerFile('.claude/lib/routing/trust-scorer.cjs');
    const summary = mapper.getSummary();
    assert.equal(summary.agent, 2);
    assert.equal(summary.lib, 1);
    assert.equal(summary.total, 3);
  });

  it('total is sum of all categories', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/dev.md');
    mapper.registerFile('.claude/skills/tdd/SKILL.md');
    mapper.registerFile('tests/lib/foo.test.cjs');
    const summary = mapper.getSummary();
    assert.equal(
      summary.total,
      summary.agent +
        summary.skill +
        summary.hook +
        summary.lib +
        summary.test +
        summary.schema +
        summary.config +
        summary.other
    );
  });
});

// ─── toJSON ─────────────────────────────────────────────────────────────────

describe('toJSON', () => {
  it('returns serializable object', () => {
    const mapper = new CodebaseMapper();
    mapper.registerFile('.claude/agents/core/dev.md');
    const json = mapper.toJSON();
    assert.doesNotThrow(() => JSON.stringify(json));
    assert.ok('map' in json);
    assert.ok('summary' in json);
    assert.ok('updatedAt' in json);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty string path', () => {
    const mapper = new CodebaseMapper();
    assert.doesNotThrow(() => mapper.registerFile(''));
    assert.equal(mapper.getSummary().total, 0);
  });

  it('handles null path', () => {
    const mapper = new CodebaseMapper();
    assert.doesNotThrow(() => mapper.registerFile(null));
    assert.equal(mapper.getSummary().total, 0);
  });
});
