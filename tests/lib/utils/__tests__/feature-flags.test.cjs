/**
 * Feature Flag Manager Tests
 *
 * Tests feature flag management with environment variables, config file, and runtime toggling
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Mock PROJECT_ROOT for testing
const TEST_ROOT = path.join(__dirname, '..', '..', '..', '..');
process.env.TEST_PROJECT_ROOT = TEST_ROOT;

// Clear environment variables before tests
const originalEnv = { ...process.env };

describe('FeatureFlagManager', () => {
  let FeatureFlagManager;
  let testConfigPath;

  before(async () => {
    // Save original config
    const configPath = path.join(TEST_ROOT, '.claude', 'config.yaml');
    testConfigPath = configPath + '.test-backup';
    if (fs.existsSync(configPath)) {
      fs.copyFileSync(configPath, testConfigPath);
    }

    // Create test config
    const testConfig = {
      features: {
        partyMode: {
          enabled: false,
          maxAgents: 5,
          turnLimit: 20,
          costLimit: 50.0,
        },
        advancedElicitation: {
          enabled: false,
          methods: ['first-principles', 'pre-mortem', 'socratic', 'red-team-blue-team'],
          costBudget: 10.0,
          minConfidence: 0.7,
        },
      },
    };

    fs.writeFileSync(configPath, yaml.dump(testConfig), 'utf8');

    // Clear require cache
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
  });

  after(async () => {
    // Restore original config
    const configPath = path.join(TEST_ROOT, '.claude', 'config.yaml');
    if (fs.existsSync(testConfigPath)) {
      fs.copyFileSync(testConfigPath, configPath);
      fs.unlinkSync(testConfigPath);
    }

    // Restore environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  it('should load default flags from config (all disabled)', async () => {
    // Clear env vars
    delete process.env.PARTY_MODE_ENABLED;
    delete process.env.ELICITATION_ENABLED;

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), false);
    assert.strictEqual(FeatureFlagManager.isEnabled('features.advancedElicitation.enabled'), false);
  });

  it('should override with environment variables (PARTY_MODE_ENABLED=true)', async () => {
    process.env.PARTY_MODE_ENABLED = 'true';

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), true);
  });

  it('should parse config file with nested configuration', async () => {
    delete process.env.PARTY_MODE_ENABLED;
    delete process.env.ELICITATION_ENABLED;

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    const config = FeatureFlagManager.getConfig('partyMode');
    assert.ok(config);
    assert.strictEqual(config.maxAgents, 5);
    assert.strictEqual(config.turnLimit, 20);
    assert.strictEqual(config.costLimit, 50.0);
  });

  it('should enable/disable flags at runtime', async () => {
    delete process.env.PARTY_MODE_ENABLED;

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    // Initially disabled
    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), false);

    // Enable
    FeatureFlagManager.enable('features.partyMode.enabled');
    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), true);

    // Disable
    FeatureFlagManager.disable('features.partyMode.enabled');
    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), false);
  });

  it('should access nested config with dot notation', async () => {
    delete process.env.PARTY_MODE_ENABLED;

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    assert.strictEqual(FeatureFlagManager.isEnabled('features.partyMode.enabled'), false);
    assert.strictEqual(FeatureFlagManager.getConfig('partyMode').maxAgents, 5);
  });

  it('should return undefined for invalid flag names', async () => {
    delete process.env.PARTY_MODE_ENABLED;

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    assert.strictEqual(FeatureFlagManager.isEnabled('invalid.flag.name'), false);
    assert.strictEqual(FeatureFlagManager.getConfig('invalid'), null);
  });

  it('should coerce string "true" to boolean true', async () => {
    process.env.ELICITATION_ENABLED = 'true';

    // Clear require cache and reload
    const modulePath = path.join(__dirname, '..', 'feature-flags.cjs');
    delete require.cache[require.resolve(modulePath)];
    FeatureFlagManager = require('../../../.claude/lib/feature-flags.cjs');

    assert.strictEqual(FeatureFlagManager.isEnabled('features.advancedElicitation.enabled'), true);
    assert.strictEqual(
      typeof FeatureFlagManager.isEnabled('features.advancedElicitation.enabled'),
      'boolean'
    );
  });
});
