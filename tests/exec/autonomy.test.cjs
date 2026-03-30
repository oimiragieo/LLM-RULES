'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTONOMY_TIERS,
  TIER_ORDER,
  PermissionViolationError,
  PermissionEnforcer,
} = require('../../.claude/lib/exec/autonomy.cjs');

// ---------------------------------------------------------------------------
// AUTONOMY_TIERS structure
// ---------------------------------------------------------------------------
describe('AUTONOMY_TIERS', () => {
  it('exports all 5 tiers', () => {
    assert.ok('readOnly' in AUTONOMY_TIERS, 'readOnly tier missing');
    assert.ok('low' in AUTONOMY_TIERS, 'low tier missing');
    assert.ok('medium' in AUTONOMY_TIERS, 'medium tier missing');
    assert.ok('high' in AUTONOMY_TIERS, 'high tier missing');
    assert.ok('skipPermissions' in AUTONOMY_TIERS, 'skipPermissions tier missing');
  });

  it('readOnly contains exactly Read, LS, Grep, Glob', () => {
    assert.deepEqual(AUTONOMY_TIERS.readOnly, ['Read', 'LS', 'Grep', 'Glob']);
  });

  it('low tier includes readOnly tools plus Create, Edit, ApplyPatch', () => {
    for (const tool of ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch']) {
      assert.ok(AUTONOMY_TIERS.low.includes(tool), `low tier missing ${tool}`);
    }
  });

  it('low tier does not include Execute', () => {
    assert.ok(!AUTONOMY_TIERS.low.includes('Execute'), 'low tier should not include Execute');
  });

  it('medium tier includes low tools plus Execute', () => {
    for (const tool of ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch', 'Execute']) {
      assert.ok(AUTONOMY_TIERS.medium.includes(tool), `medium tier missing ${tool}`);
    }
  });

  it('medium tier does not include GitPush', () => {
    assert.ok(!AUTONOMY_TIERS.medium.includes('GitPush'), 'medium tier should not include GitPush');
  });

  it('high tier includes medium tools plus GitPush', () => {
    for (const tool of [
      'Read',
      'LS',
      'Grep',
      'Glob',
      'Create',
      'Edit',
      'ApplyPatch',
      'Execute',
      'GitPush',
    ]) {
      assert.ok(AUTONOMY_TIERS.high.includes(tool), `high tier missing ${tool}`);
    }
  });

  it('skipPermissions is the wildcard string "*"', () => {
    assert.strictEqual(AUTONOMY_TIERS.skipPermissions, '*');
  });

  it('TIER_ORDER lists tiers from most to least restrictive', () => {
    assert.deepEqual(TIER_ORDER, ['readOnly', 'low', 'medium', 'high', 'skipPermissions']);
  });
});

// ---------------------------------------------------------------------------
// readOnly tier — VAL-HE-001
// ---------------------------------------------------------------------------
describe('PermissionEnforcer readOnly tier', () => {
  it('allows Read', () => {
    const e = new PermissionEnforcer('readOnly');
    assert.deepEqual(e.canUseTool('Read'), { allowed: true });
  });

  it('allows LS', () => {
    assert.deepEqual(new PermissionEnforcer('readOnly').canUseTool('LS'), { allowed: true });
  });

  it('allows Grep', () => {
    assert.deepEqual(new PermissionEnforcer('readOnly').canUseTool('Grep'), { allowed: true });
  });

  it('allows Glob', () => {
    assert.deepEqual(new PermissionEnforcer('readOnly').canUseTool('Glob'), { allowed: true });
  });

  it('blocks Edit with requiredTier low', () => {
    const result = new PermissionEnforcer('readOnly').canUseTool('Edit');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'low');
  });

  it('blocks Create with requiredTier low', () => {
    const result = new PermissionEnforcer('readOnly').canUseTool('Create');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'low');
  });

  it('blocks ApplyPatch with requiredTier low', () => {
    const result = new PermissionEnforcer('readOnly').canUseTool('ApplyPatch');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'low');
  });

  it('blocks Execute with requiredTier medium', () => {
    const result = new PermissionEnforcer('readOnly').canUseTool('Execute');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'medium');
  });

  it('blocks GitPush with requiredTier high', () => {
    const result = new PermissionEnforcer('readOnly').canUseTool('GitPush');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'high');
  });

  it('enforce does not throw for Read', () => {
    assert.doesNotThrow(() => new PermissionEnforcer('readOnly').enforce('Read'));
  });

  it('enforce throws PermissionViolationError for Edit', () => {
    assert.throws(
      () => new PermissionEnforcer('readOnly').enforce('Edit'),
      PermissionViolationError
    );
  });

  it('enforce throws PermissionViolationError for Execute', () => {
    assert.throws(
      () => new PermissionEnforcer('readOnly').enforce('Execute'),
      PermissionViolationError
    );
  });
});

// ---------------------------------------------------------------------------
// low tier — VAL-HE-002
// ---------------------------------------------------------------------------
describe('PermissionEnforcer low tier', () => {
  it('allows Edit', () => {
    assert.deepEqual(new PermissionEnforcer('low').canUseTool('Edit'), { allowed: true });
  });

  it('allows Create', () => {
    assert.deepEqual(new PermissionEnforcer('low').canUseTool('Create'), { allowed: true });
  });

  it('allows ApplyPatch', () => {
    assert.deepEqual(new PermissionEnforcer('low').canUseTool('ApplyPatch'), { allowed: true });
  });

  it('allows all readOnly tools', () => {
    const e = new PermissionEnforcer('low');
    for (const tool of ['Read', 'LS', 'Grep', 'Glob']) {
      assert.strictEqual(e.canUseTool(tool).allowed, true, `low should allow ${tool}`);
    }
  });

  it('blocks Execute with requiredTier medium', () => {
    const result = new PermissionEnforcer('low').canUseTool('Execute');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'medium');
  });

  it('blocks GitPush with requiredTier high', () => {
    const result = new PermissionEnforcer('low').canUseTool('GitPush');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'high');
  });

  it('enforce does not throw for Create', () => {
    assert.doesNotThrow(() => new PermissionEnforcer('low').enforce('Create'));
  });

  it('enforce throws PermissionViolationError for Execute', () => {
    assert.throws(() => new PermissionEnforcer('low').enforce('Execute'), PermissionViolationError);
  });
});

// ---------------------------------------------------------------------------
// medium tier — VAL-HE-002
// ---------------------------------------------------------------------------
describe('PermissionEnforcer medium tier', () => {
  it('allows Execute', () => {
    assert.deepEqual(new PermissionEnforcer('medium').canUseTool('Execute'), { allowed: true });
  });

  it('allows all low-tier tools', () => {
    const e = new PermissionEnforcer('medium');
    for (const tool of ['Read', 'LS', 'Grep', 'Glob', 'Create', 'Edit', 'ApplyPatch']) {
      assert.strictEqual(e.canUseTool(tool).allowed, true, `medium should allow ${tool}`);
    }
  });

  it('blocks GitPush with requiredTier high', () => {
    const result = new PermissionEnforcer('medium').canUseTool('GitPush');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'high');
  });

  it('enforce does not throw for Execute', () => {
    assert.doesNotThrow(() => new PermissionEnforcer('medium').enforce('Execute'));
  });

  it('enforce throws PermissionViolationError for GitPush', () => {
    assert.throws(
      () => new PermissionEnforcer('medium').enforce('GitPush'),
      PermissionViolationError
    );
  });
});

// ---------------------------------------------------------------------------
// high tier — VAL-HE-002
// ---------------------------------------------------------------------------
describe('PermissionEnforcer high tier', () => {
  it('allows GitPush', () => {
    assert.deepEqual(new PermissionEnforcer('high').canUseTool('GitPush'), { allowed: true });
  });

  it('allows all standard tools', () => {
    const e = new PermissionEnforcer('high');
    for (const tool of [
      'Read',
      'LS',
      'Grep',
      'Glob',
      'Create',
      'Edit',
      'ApplyPatch',
      'Execute',
      'GitPush',
    ]) {
      assert.strictEqual(e.canUseTool(tool).allowed, true, `high should allow ${tool}`);
    }
  });

  it('blocks unknown tools (requires skipPermissions)', () => {
    const result = new PermissionEnforcer('high').canUseTool('SomeUnknownDangerousTool');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiredTier, 'skipPermissions');
  });

  it('enforce does not throw for GitPush', () => {
    assert.doesNotThrow(() => new PermissionEnforcer('high').enforce('GitPush'));
  });

  it('enforce throws PermissionViolationError for unknown tool', () => {
    assert.throws(
      () => new PermissionEnforcer('high').enforce('UnknownTool'),
      PermissionViolationError
    );
  });
});

// ---------------------------------------------------------------------------
// skipPermissions tier — VAL-HE-002
// ---------------------------------------------------------------------------
describe('PermissionEnforcer skipPermissions tier', () => {
  it('allows all standard tools', () => {
    const e = new PermissionEnforcer('skipPermissions');
    for (const tool of [
      'Read',
      'LS',
      'Grep',
      'Glob',
      'Create',
      'Edit',
      'ApplyPatch',
      'Execute',
      'GitPush',
    ]) {
      assert.deepEqual(
        e.canUseTool(tool),
        { allowed: true },
        `skipPermissions should allow ${tool}`
      );
    }
  });

  it('allows arbitrary unknown tools', () => {
    const e = new PermissionEnforcer('skipPermissions');
    assert.deepEqual(e.canUseTool('AnyTool'), { allowed: true });
    assert.deepEqual(e.canUseTool('DangerousTool'), { allowed: true });
    assert.deepEqual(e.canUseTool('SomeObscureOperation'), { allowed: true });
  });

  it('enforce does not throw for any tool', () => {
    const e = new PermissionEnforcer('skipPermissions');
    assert.doesNotThrow(() => e.enforce('GitPush'));
    assert.doesNotThrow(() => e.enforce('Execute'));
    assert.doesNotThrow(() => e.enforce('AnyArbitraryTool'));
  });
});

// ---------------------------------------------------------------------------
// PermissionViolationError — VAL-HE-001, VAL-HE-002
// ---------------------------------------------------------------------------
describe('PermissionViolationError', () => {
  it('is instanceof Error', () => {
    const err = new PermissionViolationError({
      toolName: 'Execute',
      currentTier: 'readOnly',
      requiredTier: 'medium',
    });
    assert.ok(err instanceof Error);
  });

  it('has name "PermissionViolationError"', () => {
    const err = new PermissionViolationError({
      toolName: 'X',
      currentTier: 'a',
      requiredTier: 'b',
    });
    assert.strictEqual(err.name, 'PermissionViolationError');
  });

  it('carries toolName, currentTier, requiredTier', () => {
    const err = new PermissionViolationError({
      toolName: 'GitPush',
      currentTier: 'medium',
      requiredTier: 'high',
    });
    assert.strictEqual(err.toolName, 'GitPush');
    assert.strictEqual(err.currentTier, 'medium');
    assert.strictEqual(err.requiredTier, 'high');
  });

  it('has a non-empty message mentioning the tool', () => {
    const err = new PermissionViolationError({
      toolName: 'Execute',
      currentTier: 'readOnly',
      requiredTier: 'medium',
    });
    assert.ok(err.message.length > 0);
    assert.ok(err.message.includes('Execute'));
  });
});

// ---------------------------------------------------------------------------
// enforce structured error — VAL-HE-001
// ---------------------------------------------------------------------------
describe('PermissionEnforcer enforce structured error', () => {
  it('throws with correct toolName, currentTier, requiredTier (readOnly->Execute)', () => {
    const e = new PermissionEnforcer('readOnly');
    try {
      e.enforce('Execute');
      assert.fail('Should have thrown PermissionViolationError');
    } catch (err) {
      assert.ok(err instanceof PermissionViolationError);
      assert.strictEqual(err.toolName, 'Execute');
      assert.strictEqual(err.currentTier, 'readOnly');
      assert.strictEqual(err.requiredTier, 'medium');
    }
  });

  it('throws with correct properties (medium->GitPush)', () => {
    const e = new PermissionEnforcer('medium');
    try {
      e.enforce('GitPush');
      assert.fail('Should have thrown PermissionViolationError');
    } catch (err) {
      assert.ok(err instanceof PermissionViolationError);
      assert.strictEqual(err.toolName, 'GitPush');
      assert.strictEqual(err.currentTier, 'medium');
      assert.strictEqual(err.requiredTier, 'high');
    }
  });

  it('throws with requiredTier skipPermissions for completely unknown tool (low tier)', () => {
    const e = new PermissionEnforcer('low');
    try {
      e.enforce('UnknownTool');
      assert.fail('Should have thrown PermissionViolationError');
    } catch (err) {
      assert.ok(err instanceof PermissionViolationError);
      assert.strictEqual(err.toolName, 'UnknownTool');
      assert.strictEqual(err.currentTier, 'low');
      assert.strictEqual(err.requiredTier, 'skipPermissions');
    }
  });
});

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------
describe('PermissionEnforcer constructor', () => {
  it('throws for unknown tier', () => {
    assert.throws(() => new PermissionEnforcer('nonExistentTier'), Error);
  });

  it('accepts all valid tier names', () => {
    for (const tier of TIER_ORDER) {
      assert.doesNotThrow(() => new PermissionEnforcer(tier), `Should accept tier: ${tier}`);
    }
  });
});
