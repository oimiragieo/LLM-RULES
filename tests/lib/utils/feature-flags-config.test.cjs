'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { FeatureFlags } = require('../../../.claude/lib/utils/feature-flags.cjs');

function withEnv(vars, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function writeConfig(root, yaml) {
  const dir = path.join(root, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.yaml'), yaml, 'utf8');
}

test('loads party_mode from config.yaml when env is unset', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-flags-'));
  try {
    writeConfig(
      root,
      [
        'features:',
        '  partyMode:',
        '    enabled: true',
        '  advancedElicitation:',
        '    enabled: false',
        '',
      ].join('\n')
    );

    withEnv({ PARTY_MODE_ENABLED: undefined, PARTY_ROLLOUT_PERCENTAGE: undefined }, () => {
      const flags = new FeatureFlags({ projectRoot: root });
      assert.equal(flags.isEnabled('party_mode'), true);
      assert.equal(flags.getRolloutPercentage('party_mode'), 100);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('env variables override config values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-flags-'));
  try {
    writeConfig(
      root,
      [
        'features:',
        '  partyMode:',
        '    enabled: true',
        '',
      ].join('\n')
    );

    withEnv({ PARTY_MODE_ENABLED: 'false', PARTY_ROLLOUT_PERCENTAGE: '25' }, () => {
      const flags = new FeatureFlags({ projectRoot: root });
      assert.equal(flags.isEnabled('party_mode'), false);
      assert.equal(flags.getRolloutPercentage('party_mode'), 25);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

