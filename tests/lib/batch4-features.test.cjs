#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// B4: Checkpoint Protocol
const {
  CHECKPOINT_TYPES,
  createCheckpoint,
  isAutoBypassable,
  resolveCheckpoint,
  autoBypassCheckpoints,
} = require('../../.claude/lib/orchestration/checkpoint-protocol.cjs');

// D6: Compression Validation
const {
  validateCompression,
} = require('../../.claude/lib/orchestration/compression-validator.cjs');

// H2: Skill Auto-Router
const {
  computeKeywordScore,
  extractKeywords,
  extractDescription,
} = require('../../.claude/lib/routing/skill-auto-router.cjs');

describe('B4: Checkpoint Protocol', () => {
  it('creates valid checkpoint', () => {
    const cp = createCheckpoint({
      id: 'cp-1',
      type: 'human-verify',
      description: 'Verify tests pass',
      task_id: 'task-5',
    });
    assert.equal(cp.id, 'cp-1');
    assert.equal(cp.type, 'human-verify');
    assert.equal(cp.status, 'pending');
  });

  it('rejects invalid checkpoint type', () => {
    assert.throws(() =>
      createCheckpoint({ id: 'x', type: 'invalid', description: 'x', task_id: '1' }),
    );
  });

  it('human-verify is auto-bypassable', () => {
    const cp = createCheckpoint({ id: 'x', type: 'human-verify', description: 'x', task_id: '1' });
    assert.equal(isAutoBypassable(cp), true);
  });

  it('human-action is NOT auto-bypassable', () => {
    const cp = createCheckpoint({ id: 'x', type: 'human-action', description: 'x', task_id: '1' });
    assert.equal(isAutoBypassable(cp), false);
  });

  it('resolveCheckpoint updates status', () => {
    const cp = createCheckpoint({ id: 'x', type: 'human-verify', description: 'x', task_id: '1' });
    const resolved = resolveCheckpoint(cp, 'passed', { verified_by: 'user' });
    assert.equal(resolved.status, 'passed');
    assert.equal(resolved.verified_by, 'user');
  });

  it('autoBypassCheckpoints skips human-action', () => {
    const checkpoints = [
      createCheckpoint({ id: 'a', type: 'human-verify', description: 'auto', task_id: '1' }),
      createCheckpoint({ id: 'b', type: 'human-action', description: 'manual', task_id: '1' }),
      createCheckpoint({ id: 'c', type: 'decision', description: 'choose', task_id: '1' }),
    ];
    const result = autoBypassCheckpoints(checkpoints);
    assert.equal(result.resolved[0].status, 'passed'); // auto-bypassed
    assert.equal(result.blocker.id, 'b'); // blocked at human-action
    assert.equal(result.resolved.length, 2); // a + b (c never reached)
  });

  it('has three checkpoint types', () => {
    assert.equal(Object.keys(CHECKPOINT_TYPES).length, 3);
  });
});

describe('D6: Compression Validation', () => {
  it('validates code compression preserving function names', () => {
    const original = `function calculateTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}
module.exports = { calculateTotal };`;
    const compressed = '// calculateTotal: computes total from items array\n// exports: calculateTotal';
    const result = validateCompression(original, compressed, { contentType: 'code' });
    assert.ok(result.checks.length > 0);
  });

  it('validates documentation compression preserving headings', () => {
    const original = '# Setup\nInstall deps\n# Usage\nRun the app\n# API\nEndpoints here';
    const compressed = '# Setup\n# Usage\n# API';
    const result = validateCompression(original, compressed, { contentType: 'documentation' });
    const headingCheck = result.checks.find((c) => c.check === 'headings_preserved');
    assert.ok(headingCheck);
    assert.equal(headingCheck.passed, true);
  });

  it('warns when compressed is larger', () => {
    const original = 'short';
    const compressed = 'this is actually much longer than the original content was';
    const result = validateCompression(original, compressed, { contentType: 'documentation' });
    assert.ok(result.warnings.some((w) => w.includes('LARGER')));
  });

  it('handles empty content', () => {
    const result = validateCompression('', '');
    assert.equal(result.valid, false);
  });

  it('validates log compression', () => {
    const original = '2026-01-01 ERROR db fail\n2026-01-02 INFO ok\n2026-01-03 ERROR timeout';
    const compressed = '3 lines: 2 errors, 0 warnings. 2026-01-01 to 2026-01-03';
    const result = validateCompression(original, compressed, { contentType: 'logs' });
    const errorCheck = result.checks.find((c) => c.check === 'error_count_preserved');
    assert.ok(errorCheck);
  });
});

describe('H2: Skill Auto-Router', () => {
  describe('extractKeywords', () => {
    it('extracts meaningful keywords', () => {
      const kw = extractKeywords('Run unit tests and check code coverage');
      assert.ok(kw.includes('unit'));
      assert.ok(kw.includes('tests'));
      assert.ok(kw.includes('coverage'));
    });

    it('removes stopwords', () => {
      const kw = extractKeywords('the and for with this that from');
      assert.equal(kw.length, 0);
    });

    it('lowercases keywords', () => {
      const kw = extractKeywords('TDD Testing SECURITY');
      assert.ok(kw.includes('tdd'));
      assert.ok(kw.includes('testing'));
      assert.ok(kw.includes('security'));
    });
  });

  describe('extractDescription', () => {
    it('extracts from frontmatter', () => {
      const content = '---\ndescription: Test runner skill\n---\n# Skill';
      assert.equal(extractDescription(content), 'Test runner skill');
    });

    it('falls back to first paragraph', () => {
      const content = '# My Skill\n\nThis is a skill for testing.';
      assert.equal(extractDescription(content), 'This is a skill for testing.');
    });
  });

  describe('computeKeywordScore', () => {
    it('returns 0 for no overlap', () => {
      assert.equal(computeKeywordScore(['apple', 'banana'], ['cherry', 'date']), 0);
    });

    it('returns positive for partial overlap', () => {
      const score = computeKeywordScore(['test', 'coverage'], ['test', 'runner', 'coverage']);
      assert.ok(score > 0);
    });

    it('handles empty arrays', () => {
      assert.equal(computeKeywordScore([], ['test']), 0);
      assert.equal(computeKeywordScore(['test'], []), 0);
    });

    it('scores partial word matches lower', () => {
      const exact = computeKeywordScore(['testing'], ['testing']);
      const partial = computeKeywordScore(['test'], ['testing']);
      assert.ok(exact >= partial);
    });
  });
});
