'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { discoverPlugins } = require('../../.claude/lib/plugins/marketplace.cjs');

function withDefaultAuthor(manifest) {
  if (!manifest || Object.prototype.hasOwnProperty.call(manifest, 'author')) {
    return manifest;
  }
  if (
    typeof manifest.name === 'string' &&
    typeof manifest.description === 'string' &&
    typeof manifest.version === 'string'
  ) {
    return Object.assign({}, manifest, { author: { name: 'Test Author' } });
  }
  return manifest;
}

function writeMarketplaceManifest(pluginDir, manifest, options = {}) {
  const manifestDir = options.legacy ? pluginDir : path.join(pluginDir, '.claude-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, 'plugin.json'),
    JSON.stringify(withDefaultAuthor(manifest), null, 2)
  );
}

function createFixtureMarketplace(marketplacesDir, marketplaceName, plugins = []) {
  const marketplaceDir = path.join(marketplacesDir, marketplaceName);
  fs.mkdirSync(marketplaceDir, { recursive: true });

  for (const { name, manifest } of plugins) {
    const pluginDir = path.join(marketplaceDir, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    if (manifest !== null) {
      writeMarketplaceManifest(pluginDir, manifest);
    }
  }
}

describe('marketplace discovery', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-discovery-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows - ignore
    }
  });

  it('returns empty array when marketplacesDir does not exist', () => {
    const result = discoverPlugins(path.join(tmpDir, 'discover-missing'));
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('returns empty array when marketplacesDir is empty', () => {
    const emptyDir = path.join(tmpDir, 'discover-empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = discoverPlugins(emptyDir);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('discovers plugins from a single marketplace dir (VAL-PM-005)', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-single');
    createFixtureMarketplace(marketplacesDir, 'market-a', [
      {
        name: 'plugin-one',
        manifest: { name: 'plugin-one', description: 'Plugin One', version: '1.0.0' },
      },
      {
        name: 'plugin-two',
        manifest: { name: 'plugin-two', description: 'Plugin Two', version: '2.1.0' },
      },
    ]);

    const names = discoverPlugins(marketplacesDir)
      .map(p => p.name)
      .sort();
    assert.deepEqual(names, ['plugin-one', 'plugin-two']);
  });

  it('each discovered plugin has name, description, version from manifest (VAL-PM-005)', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-fields');
    createFixtureMarketplace(marketplacesDir, 'market-b', [
      {
        name: 'rich-plugin',
        manifest: { name: 'rich-plugin', description: 'A rich plugin', version: '3.0.0' },
      },
    ]);

    const [plugin] = discoverPlugins(marketplacesDir);
    assert.equal(plugin.name, 'rich-plugin');
    assert.equal(plugin.description, 'A rich plugin');
    assert.equal(plugin.version, '3.0.0');
  });

  it('discovered plugin includes marketplace name and pluginDir', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-meta');
    createFixtureMarketplace(marketplacesDir, 'meta-market', [
      {
        name: 'meta-plugin',
        manifest: { name: 'meta-plugin', description: 'Meta', version: '1.0.0' },
      },
    ]);

    const [plugin] = discoverPlugins(marketplacesDir);
    assert.equal(plugin.marketplace, 'meta-market');
    assert.ok(plugin.pluginDir, 'pluginDir must be present');
    assert.ok(fs.existsSync(plugin.pluginDir), 'pluginDir must point to an existing directory');
  });

  it('discovers plugins across multiple marketplaces', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-multi');
    createFixtureMarketplace(marketplacesDir, 'market-x', [
      { name: 'x-plugin', manifest: { name: 'x-plugin', description: 'X', version: '1.0.0' } },
    ]);
    createFixtureMarketplace(marketplacesDir, 'market-y', [
      { name: 'y-plugin', manifest: { name: 'y-plugin', description: 'Y', version: '1.0.0' } },
      { name: 'z-plugin', manifest: { name: 'z-plugin', description: 'Z', version: '1.0.0' } },
    ]);

    const names = discoverPlugins(marketplacesDir)
      .map(p => p.name)
      .sort();
    assert.deepEqual(names, ['x-plugin', 'y-plugin', 'z-plugin']);
  });

  it('skips plugin dirs with missing plugin.json gracefully', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-missing-json');
    createFixtureMarketplace(marketplacesDir, 'market-skip', [
      { name: 'no-manifest', manifest: null },
      {
        name: 'valid-plugin',
        manifest: { name: 'valid-plugin', description: 'Valid', version: '1.0.0' },
      },
    ]);

    const result = discoverPlugins(marketplacesDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'valid-plugin');
  });

  it('skips plugin dirs with invalid (non-JSON) plugin.json gracefully', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-bad-json');
    createFixtureMarketplace(marketplacesDir, 'market-bad', []);
    const badPluginDir = path.join(marketplacesDir, 'market-bad', 'bad-plugin');
    fs.mkdirSync(path.join(badPluginDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(badPluginDir, '.claude-plugin', 'plugin.json'),
      '{ not valid json !!!'
    );

    assert.equal(discoverPlugins(marketplacesDir).length, 0);
  });

  it('skips plugin dirs with incomplete manifest gracefully', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-incomplete');
    createFixtureMarketplace(marketplacesDir, 'market-inc', [
      { name: 'missing-name', manifest: { description: 'No name', version: '1.0.0' } },
      { name: 'missing-description', manifest: { name: 'no-desc', version: '1.0.0' } },
      { name: 'missing-version', manifest: { name: 'no-ver', description: 'No version' } },
      {
        name: 'missing-author',
        manifest: {
          name: 'missing-author',
          description: 'No author',
          version: '1.0.0',
          author: undefined,
        },
      },
      {
        name: 'full-plugin',
        manifest: { name: 'full-plugin', description: 'Full', version: '1.0.0' },
      },
    ]);

    const result = discoverPlugins(marketplacesDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'full-plugin');
  });

  it('skips hidden directories (e.g. .git) within marketplacesDir', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-hidden');
    createFixtureMarketplace(marketplacesDir, 'real-market', [
      {
        name: 'real-plugin',
        manifest: { name: 'real-plugin', description: 'Real', version: '1.0.0' },
      },
    ]);

    writeMarketplaceManifest(path.join(marketplacesDir, '.git', 'some-plugin'), {
      name: 'hidden',
      description: 'Hidden',
      version: '1.0.0',
    });

    const result = discoverPlugins(marketplacesDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'real-plugin');
  });

  it('discovers legacy root plugin.json when it satisfies the installer schema', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-legacy-root');
    const pluginDir = path.join(marketplacesDir, 'legacy-market', 'legacy-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    writeMarketplaceManifest(
      pluginDir,
      {
        name: 'legacy-plugin',
        description: 'Legacy root manifest',
        version: '1.0.0',
        author: { name: 'Legacy Author' },
      },
      { legacy: true }
    );

    const result = discoverPlugins(marketplacesDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'legacy-plugin');
  });

  it('returns empty array when marketplacesDir has no valid plugin.json files', () => {
    const marketplacesDir = path.join(tmpDir, 'discover-no-plugins');
    createFixtureMarketplace(marketplacesDir, 'empty-market', []);
    assert.equal(discoverPlugins(marketplacesDir).length, 0);
  });
});
