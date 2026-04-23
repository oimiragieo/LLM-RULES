'use strict';
// <!-- Agent: architect | Task: #S2-agent-manifest | Session: 2026-04-20 -->

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateManifest,
  loadManifest,
  MANIFEST_VERSION,
  ManifestStartupError,
} = require('../../../.claude/lib/manifest/manifest-validator.cjs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildValidManifest(overrides = {}) {
  return Object.assign(
    {
      manifest_version: '1.0',
      agent_id: 'test-agent',
      agent_type: 'core',
      capabilities: [
        { tool_name: 'Read', allowed: true },
        { tool_name: 'Write', allowed: true },
      ],
      memory_tier: 'MTM',
      cost_envelope: {
        max_tokens_per_task: 100000,
        max_usd_per_session: 2.0,
        preferred_model: 'sonnet',
      },
      session_type: 'ephemeral',
      a2a_interop: {
        supports_mcp: true,
        supports_aip_tokens: false,
        supports_maf: true,
      },
    },
    overrides
  );
}

// ---------------------------------------------------------------------------
// Test 1: Valid manifest passes
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 1: valid manifest passes', () => {
  it('accepts a fully specified valid manifest', () => {
    const manifest = buildValidManifest();
    const result = validateManifest(manifest);
    assert.equal(result.valid, true, `Expected valid=true, got errors: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  });

  it('accepts manifest with optional rate_limit on a capability', () => {
    const manifest = buildValidManifest({
      capabilities: [
        { tool_name: 'Bash', allowed: true, rate_limit: { calls_per_task: 50 } },
        { tool_name: 'Write', allowed: false },
      ],
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
  });

  it('accepts manifest with optional MAF modes', () => {
    const manifest = buildValidManifest({
      a2a_interop: {
        supports_mcp: true,
        supports_aip_tokens: true,
        supports_maf: true,
        maf_input_modes: ['text', 'code'],
        maf_output_modes: ['text', 'file'],
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
  });

  it('accepts all valid memory_tier values', () => {
    for (const tier of ['STM', 'MTM', 'LTM', 'NONE']) {
      const result = validateManifest(buildValidManifest({ memory_tier: tier }));
      assert.equal(result.valid, true, `memory_tier=${tier} should be valid`);
    }
  });

  it('accepts all valid session_type values', () => {
    for (const st of ['ephemeral', 'persistent', 'delegated']) {
      const result = validateManifest(buildValidManifest({ session_type: st }));
      assert.equal(result.valid, true, `session_type=${st} should be valid`);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: Missing required field fails with specific error
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 2: missing required fields', () => {
  const requiredTopLevel = [
    'manifest_version',
    'agent_id',
    'agent_type',
    'capabilities',
    'memory_tier',
    'cost_envelope',
    'session_type',
    'a2a_interop',
  ];

  for (const field of requiredTopLevel) {
    it(`rejects manifest missing '${field}' with a specific error message`, () => {
      const manifest = buildValidManifest();
      delete manifest[field];
      const result = validateManifest(manifest);
      assert.equal(result.valid, false, `Expected invalid when '${field}' is absent`);
      assert.ok(
        result.errors.length > 0,
        `Expected at least one error when '${field}' is absent`
      );
      // Error must mention the missing field
      const errorText = result.errors.join(' ');
      assert.ok(
        errorText.includes(field),
        `Error message should mention '${field}', got: ${errorText}`
      );
    });
  }

  it('rejects manifest missing cost_envelope.max_tokens_per_task with specific error', () => {
    const manifest = buildValidManifest();
    delete manifest.cost_envelope.max_tokens_per_task;
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    const errorText = result.errors.join(' ');
    assert.ok(
      errorText.includes('max_tokens_per_task'),
      `Expected error to mention 'max_tokens_per_task', got: ${errorText}`
    );
  });

  it('rejects manifest missing a2a_interop.supports_mcp with specific error', () => {
    const manifest = buildValidManifest();
    delete manifest.a2a_interop.supports_mcp;
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    const errorText = result.errors.join(' ');
    assert.ok(
      errorText.includes('supports_mcp'),
      `Expected error to mention 'supports_mcp', got: ${errorText}`
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Invalid enum value rejected
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 3: invalid enum values rejected', () => {
  it('rejects unknown memory_tier', () => {
    const manifest = buildValidManifest({ memory_tier: 'ULTRA' });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('memory_tier'));
  });

  it('rejects unknown session_type', () => {
    const manifest = buildValidManifest({ session_type: 'transient' });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('session_type'));
  });

  it('rejects unknown manifest_version', () => {
    const manifest = buildValidManifest({ manifest_version: '2.0' });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('manifest_version'));
  });

  it('rejects unknown agent_type', () => {
    const manifest = buildValidManifest({ agent_type: 'unknown-type' });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('agent_type'));
  });

  it('rejects unknown preferred_model', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 100000,
        max_usd_per_session: 2.0,
        preferred_model: 'gpt-4o',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('preferred_model'));
  });
});

// ---------------------------------------------------------------------------
// Test 4: BC-2 — agent without manifest block throws startup error
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 4: BC-2 startup enforcement', () => {
  it('loadManifest throws ManifestStartupError when manifest is null', () => {
    assert.throws(
      () => loadManifest(null, { strict: true }),
      ManifestStartupError,
      'Expected ManifestStartupError for null manifest'
    );
  });

  it('loadManifest throws ManifestStartupError when manifest is undefined', () => {
    assert.throws(
      () => loadManifest(undefined, { strict: true }),
      ManifestStartupError
    );
  });

  it('loadManifest throws ManifestStartupError when manifest is empty object', () => {
    assert.throws(
      () => loadManifest({}, { strict: true }),
      ManifestStartupError
    );
  });

  it('ManifestStartupError message includes agent_id when available', () => {
    try {
      loadManifest({ agent_id: 'my-agent' }, { strict: true });
      assert.fail('Expected ManifestStartupError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ManifestStartupError);
      assert.ok(
        err.message.includes('my-agent'),
        `Error message should include agent_id, got: ${err.message}`
      );
    }
  });

  it('loadManifest returns validated manifest when valid and strict=true', () => {
    const manifest = buildValidManifest();
    const loaded = loadManifest(manifest, { strict: true });
    assert.equal(loaded.agent_id, 'test-agent');
    assert.equal(loaded.manifest_version, '1.0');
  });

  it('loadManifest with strict=false returns null (not throw) for invalid manifest', () => {
    // Non-strict mode: returns null, does not throw
    const result = loadManifest(null, { strict: false });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Test 5: manifest version drift → upgrade path hint
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 5: manifest version drift upgrade hint', () => {
  it('MANIFEST_VERSION constant is exported and equals "1.0"', () => {
    assert.equal(MANIFEST_VERSION, '1.0');
  });

  it('provides upgrade hint when manifest_version is missing', () => {
    const manifest = buildValidManifest();
    delete manifest.manifest_version;
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    // Should include upgrade path hint
    assert.ok(
      result.upgradeHint !== undefined,
      'Expected upgradeHint field when manifest_version is absent'
    );
    assert.ok(
      typeof result.upgradeHint === 'string' && result.upgradeHint.length > 0,
      'upgradeHint should be a non-empty string'
    );
  });

  it('upgrade hint references current MANIFEST_VERSION', () => {
    const manifest = buildValidManifest();
    delete manifest.manifest_version;
    const result = validateManifest(manifest);
    assert.ok(
      result.upgradeHint && result.upgradeHint.includes(MANIFEST_VERSION),
      `upgradeHint should reference current version '${MANIFEST_VERSION}', got: ${result.upgradeHint}`
    );
  });

  it('no upgrade hint when manifest_version is current', () => {
    const manifest = buildValidManifest({ manifest_version: '1.0' });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
    // No upgradeHint needed for current version
    assert.ok(
      !result.upgradeHint || result.upgradeHint === '',
      'Should not have an upgradeHint for current version'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6: cost_envelope constraints integrate with token-governor + spend-guard
// ---------------------------------------------------------------------------

describe('manifest-validator — Test 6: cost_envelope integration constraints', () => {
  it('rejects max_tokens_per_task below minimum (1000)', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 500,
        max_usd_per_session: 2.0,
        preferred_model: 'sonnet',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('max_tokens_per_task'));
  });

  it('rejects max_tokens_per_task above maximum (2000000)', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 9999999,
        max_usd_per_session: 2.0,
        preferred_model: 'sonnet',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('max_tokens_per_task'));
  });

  it('rejects max_usd_per_session of 0', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 100000,
        max_usd_per_session: 0,
        preferred_model: 'sonnet',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.join(' ').includes('max_usd_per_session'));
  });

  it('valid cost_envelope exposes token budget compatible with token-governor DEFAULT_BUDGET', () => {
    // token-governor DEFAULT_BUDGET = 100000 tokens; a manifest with max_tokens_per_task=100000
    // is valid and should be loadable
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 100000,
        max_usd_per_session: 2.0,
        preferred_model: 'sonnet',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
    // The loaded manifest exposes max_tokens_per_task for token-governor consumption
    const loaded = loadManifest(manifest, { strict: true });
    assert.equal(loaded.cost_envelope.max_tokens_per_task, 100000);
  });

  it('valid cost_envelope with preferred_model=haiku (cheapest tier) is accepted', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 50000,
        max_usd_per_session: 0.5,
        preferred_model: 'haiku',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
  });

  it('valid cost_envelope with preferred_model=opus (highest tier) is accepted', () => {
    const manifest = buildValidManifest({
      cost_envelope: {
        max_tokens_per_task: 200000,
        max_usd_per_session: 10.0,
        preferred_model: 'opus',
      },
    });
    const result = validateManifest(manifest);
    assert.equal(result.valid, true);
  });
});
