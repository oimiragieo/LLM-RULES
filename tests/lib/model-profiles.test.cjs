'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ModelProfiles,
  resolveModel,
  DEFAULT_PROFILES,
} = require('../../.claude/lib/routing/model-profiles.cjs');

// ─── DEFAULT_PROFILES ───────────────────────────────────────────────────────

describe('DEFAULT_PROFILES', () => {
  it('has haiku profile', () => {
    assert.ok(DEFAULT_PROFILES.haiku);
    assert.equal(DEFAULT_PROFILES.haiku.id, 'haiku');
  });

  it('has sonnet profile', () => {
    assert.ok(DEFAULT_PROFILES.sonnet);
    assert.equal(DEFAULT_PROFILES.sonnet.id, 'sonnet');
  });

  it('has opus profile', () => {
    assert.ok(DEFAULT_PROFILES.opus);
    assert.equal(DEFAULT_PROFILES.opus.id, 'opus');
  });

  it('profiles have cost tiers', () => {
    assert.ok(DEFAULT_PROFILES.haiku.costTier < DEFAULT_PROFILES.sonnet.costTier);
    assert.ok(DEFAULT_PROFILES.sonnet.costTier < DEFAULT_PROFILES.opus.costTier);
  });

  it('profiles have capability descriptions', () => {
    for (const p of Object.values(DEFAULT_PROFILES)) {
      assert.equal(typeof p.description, 'string');
      assert.ok(p.description.length > 0);
    }
  });
});

// ─── ModelProfiles ──────────────────────────────────────────────────────────

describe('ModelProfiles', () => {
  it('creates with defaults', () => {
    const mp = new ModelProfiles();
    assert.ok(mp.getProfile('haiku'));
    assert.ok(mp.getProfile('sonnet'));
    assert.ok(mp.getProfile('opus'));
  });

  it('creates with custom profiles', () => {
    const mp = new ModelProfiles({
      custom: { id: 'custom', costTier: 2, description: 'Custom model' },
    });
    assert.ok(mp.getProfile('custom'));
  });

  it('getProfile returns null for unknown', () => {
    const mp = new ModelProfiles();
    assert.equal(mp.getProfile('unknown'), null);
  });

  it('listProfiles returns all', () => {
    const mp = new ModelProfiles();
    const list = mp.listProfiles();
    assert.ok(list.length >= 3);
  });

  it('addProfile adds new profile', () => {
    const mp = new ModelProfiles();
    mp.addProfile({ id: 'turbo', costTier: 1.5, description: 'Fast' });
    assert.ok(mp.getProfile('turbo'));
  });

  it('removeProfile removes', () => {
    const mp = new ModelProfiles();
    mp.addProfile({ id: 'temp', costTier: 1, description: 'Temp' });
    mp.removeProfile('temp');
    assert.equal(mp.getProfile('temp'), null);
  });
});

// ─── resolveModel ───────────────────────────────────────────────────────────

describe('resolveModel', () => {
  it('explicit override wins', () => {
    const result = resolveModel({
      explicit: 'opus',
      frontmatter: 'sonnet',
      configYaml: 'haiku',
      complexityDefault: 'sonnet',
    });
    assert.equal(result.model, 'opus');
    assert.equal(result.source, 'explicit');
  });

  it('frontmatter is second priority', () => {
    const result = resolveModel({
      frontmatter: 'sonnet',
      configYaml: 'haiku',
      complexityDefault: 'haiku',
    });
    assert.equal(result.model, 'sonnet');
    assert.equal(result.source, 'frontmatter');
  });

  it('configYaml is third priority', () => {
    const result = resolveModel({
      configYaml: 'opus',
      complexityDefault: 'haiku',
    });
    assert.equal(result.model, 'opus');
    assert.equal(result.source, 'configYaml');
  });

  it('complexityDefault is fourth priority', () => {
    const result = resolveModel({
      complexityDefault: 'opus',
    });
    assert.equal(result.model, 'opus');
    assert.equal(result.source, 'complexityDefault');
  });

  it('falls back to sonnet', () => {
    const result = resolveModel({});
    assert.equal(result.model, 'sonnet');
    assert.equal(result.source, 'fallback');
  });

  it('ignores null/undefined values in chain', () => {
    const result = resolveModel({
      explicit: null,
      frontmatter: undefined,
      configYaml: 'haiku',
    });
    assert.equal(result.model, 'haiku');
  });
});
