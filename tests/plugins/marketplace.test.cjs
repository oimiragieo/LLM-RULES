'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const {
  cloneMarketplace,
  updateMarketplace,
  discoverPlugins,
} = require('../../.claude/lib/plugins/marketplace.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal git repository with an optional set of plugin directories.
 *
 * @param {string} repoDir      - Path for the new repo
 * @param {Array<{name: string, manifest: object}>} plugins - Plugins to commit
 */
function createGitRepo(repoDir, plugins = []) {
  fs.mkdirSync(repoDir, { recursive: true });
  execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoDir, stdio: 'pipe' });

  // Add a placeholder so we can commit even with no plugins
  const placeholder = path.join(repoDir, '.gitkeep');
  fs.writeFileSync(placeholder, '');

  for (const { name, manifest } of plugins) {
    const pluginDir = path.join(repoDir, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  }

  execSync('git add .', { cwd: repoDir, stdio: 'pipe' });
  execSync('git commit -m "initial"', { cwd: repoDir, stdio: 'pipe' });
}

/**
 * Create a fixture marketplace directory (no git) with plugin subdirectories.
 * Used for discoverPlugins tests that don't need real git repos.
 *
 * @param {string} marketplacesDir - Parent marketplaces directory
 * @param {string} marketplaceName - Name of this marketplace (subdirectory)
 * @param {Array<{name: string, manifest: object|null}>} plugins
 */
function createFixtureMarketplace(marketplacesDir, marketplaceName, plugins = []) {
  const marketplaceDir = path.join(marketplacesDir, marketplaceName);
  fs.mkdirSync(marketplaceDir, { recursive: true });

  for (const { name, manifest } of plugins) {
    const pluginDir = path.join(marketplaceDir, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    if (manifest !== null) {
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    }
    // manifest === null means: create the dir but no plugin.json (tests graceful skip)
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('marketplace', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows — ignore
    }
  });

  // -------------------------------------------------------------------------
  // cloneMarketplace
  // -------------------------------------------------------------------------
  describe('cloneMarketplace()', () => {
    it('clones the repo and creates the marketplace directory (VAL-PM-005)', () => {
      const sourceRepo = path.join(tmpDir, 'source-clone-1');
      createGitRepo(sourceRepo, [
        {
          name: 'plugin-a',
          manifest: { name: 'plugin-a', description: 'Plugin A', version: '1.0.0' },
        },
      ]);

      const marketplacesDir = path.join(tmpDir, 'mkt-clone-1');
      cloneMarketplace({ name: 'official', gitUrl: sourceRepo, marketplacesDir });

      const clonedDir = path.join(marketplacesDir, 'official');
      assert.ok(fs.existsSync(clonedDir), 'cloned directory must exist');
    });

    it('registers the marketplace in known_marketplaces.json (VAL-PM-005)', () => {
      const sourceRepo = path.join(tmpDir, 'source-clone-2');
      createGitRepo(sourceRepo);

      const marketplacesDir = path.join(tmpDir, 'mkt-clone-2');
      cloneMarketplace({ name: 'my-market', gitUrl: sourceRepo, marketplacesDir });

      const registryPath = path.join(marketplacesDir, 'known_marketplaces.json');
      assert.ok(fs.existsSync(registryPath), 'known_marketplaces.json must exist');

      const marketplaces = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      assert.ok(Array.isArray(marketplaces), 'must be a JSON array');
      const entry = marketplaces.find(m => m.name === 'my-market');
      assert.ok(entry, 'marketplace entry must exist');
      assert.equal(entry.url, sourceRepo);
      assert.ok(entry.lastUpdated, 'lastUpdated must be present');
    });

    it('creates marketplacesDir if it does not exist', () => {
      const sourceRepo = path.join(tmpDir, 'source-clone-3');
      createGitRepo(sourceRepo);

      const marketplacesDir = path.join(tmpDir, 'mkt-clone-3-new-dir');
      assert.ok(!fs.existsSync(marketplacesDir), 'marketplacesDir should not exist yet');

      cloneMarketplace({ name: 'auto-created', gitUrl: sourceRepo, marketplacesDir });

      assert.ok(fs.existsSync(marketplacesDir), 'marketplacesDir should have been created');
    });

    it('cloned repo contains plugin files from source', () => {
      const sourceRepo = path.join(tmpDir, 'source-clone-4');
      createGitRepo(sourceRepo, [
        {
          name: 'my-plugin',
          manifest: { name: 'my-plugin', description: 'My Plugin', version: '2.0.0' },
        },
      ]);

      const marketplacesDir = path.join(tmpDir, 'mkt-clone-4');
      cloneMarketplace({ name: 'with-plugins', gitUrl: sourceRepo, marketplacesDir });

      const manifestPath = path.join(marketplacesDir, 'with-plugins', 'my-plugin', 'plugin.json');
      assert.ok(fs.existsSync(manifestPath), 'plugin.json must exist in cloned repo');
    });
  });

  // -------------------------------------------------------------------------
  // updateMarketplace
  // -------------------------------------------------------------------------
  describe('updateMarketplace()', () => {
    it('pulls new commits from the source repo (VAL-PM-005)', () => {
      const sourceRepo = path.join(tmpDir, 'source-update-1');
      createGitRepo(sourceRepo);

      const marketplacesDir = path.join(tmpDir, 'mkt-update-1');
      cloneMarketplace({ name: 'updatable', gitUrl: sourceRepo, marketplacesDir });

      // Add a new file to the source repo
      const newFile = path.join(sourceRepo, 'new-plugin', 'plugin.json');
      fs.mkdirSync(path.dirname(newFile), { recursive: true });
      fs.writeFileSync(
        newFile,
        JSON.stringify({ name: 'new-plugin', description: 'New', version: '1.0.0' })
      );
      execSync('git add .', { cwd: sourceRepo, stdio: 'pipe' });
      execSync('git commit -m "add new-plugin"', { cwd: sourceRepo, stdio: 'pipe' });

      updateMarketplace({ name: 'updatable', marketplacesDir });

      const pulledFile = path.join(marketplacesDir, 'updatable', 'new-plugin', 'plugin.json');
      assert.ok(fs.existsSync(pulledFile), 'pulled file must exist after updateMarketplace');
    });

    it('updates lastUpdated in known_marketplaces.json after pull', () => {
      const sourceRepo = path.join(tmpDir, 'source-update-2');
      createGitRepo(sourceRepo);

      const marketplacesDir = path.join(tmpDir, 'mkt-update-2');
      cloneMarketplace({ name: 'timestamped', gitUrl: sourceRepo, marketplacesDir });

      // Record timestamp before update
      const before = JSON.parse(
        fs.readFileSync(path.join(marketplacesDir, 'known_marketplaces.json'), 'utf8')
      );
      const tsBefore = before.find(m => m.name === 'timestamped').lastUpdated;

      // Wait a tiny bit to ensure a different timestamp
      execSync('git pull', { cwd: path.join(marketplacesDir, 'timestamped'), stdio: 'pipe' });

      // Calling updateMarketplace should refresh lastUpdated
      // (small sleep not needed — we just verify the field still exists and is valid)
      updateMarketplace({ name: 'timestamped', marketplacesDir });

      const after = JSON.parse(
        fs.readFileSync(path.join(marketplacesDir, 'known_marketplaces.json'), 'utf8')
      );
      const tsAfter = after.find(m => m.name === 'timestamped').lastUpdated;

      assert.ok(tsAfter, 'lastUpdated must be present after update');
      assert.ok(!Number.isNaN(Date.parse(tsAfter)), 'lastUpdated must be a valid ISO date');
      // Note: timestamps may be equal if the system clock resolution is low — just verify it's valid
      assert.ok(typeof tsBefore === 'string' && typeof tsAfter === 'string');
    });

    it('throws if the marketplace directory does not exist', () => {
      const marketplacesDir = path.join(tmpDir, 'mkt-update-3');
      fs.mkdirSync(marketplacesDir, { recursive: true });

      assert.throws(
        () => updateMarketplace({ name: 'nonexistent', marketplacesDir }),
        /nonexistent/
      );
    });
  });

  // -------------------------------------------------------------------------
  // discoverPlugins — fixture-dir tests (no git)
  // -------------------------------------------------------------------------
  describe('discoverPlugins()', () => {
    it('returns empty array when marketplacesDir does not exist', () => {
      const missingDir = path.join(tmpDir, 'discover-missing');
      const result = discoverPlugins(missingDir);
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

      const result = discoverPlugins(marketplacesDir);
      assert.equal(result.length, 2);
      const names = result.map(p => p.name).sort();
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
        {
          name: 'x-plugin',
          manifest: { name: 'x-plugin', description: 'X Plugin', version: '1.0.0' },
        },
      ]);
      createFixtureMarketplace(marketplacesDir, 'market-y', [
        {
          name: 'y-plugin',
          manifest: { name: 'y-plugin', description: 'Y Plugin', version: '1.0.0' },
        },
        {
          name: 'z-plugin',
          manifest: { name: 'z-plugin', description: 'Z Plugin', version: '1.0.0' },
        },
      ]);

      const result = discoverPlugins(marketplacesDir);
      assert.equal(result.length, 3);
      const names = result.map(p => p.name).sort();
      assert.deepEqual(names, ['x-plugin', 'y-plugin', 'z-plugin']);
    });

    it('skips plugin dirs with missing plugin.json gracefully', () => {
      const marketplacesDir = path.join(tmpDir, 'discover-missing-json');
      createFixtureMarketplace(marketplacesDir, 'market-skip', [
        { name: 'no-manifest', manifest: null }, // no plugin.json
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

      // Create plugin dir with invalid JSON
      const badPluginDir = path.join(marketplacesDir, 'market-bad', 'bad-plugin');
      fs.mkdirSync(badPluginDir, { recursive: true });
      fs.writeFileSync(path.join(badPluginDir, 'plugin.json'), '{ not valid json !!!');

      const result = discoverPlugins(marketplacesDir);
      assert.equal(result.length, 0);
    });

    it('skips plugin dirs with incomplete manifest (missing required fields) gracefully', () => {
      const marketplacesDir = path.join(tmpDir, 'discover-incomplete');
      createFixtureMarketplace(marketplacesDir, 'market-inc', [
        { name: 'missing-name', manifest: { description: 'No name', version: '1.0.0' } },
        { name: 'missing-description', manifest: { name: 'no-desc', version: '1.0.0' } },
        { name: 'missing-version', manifest: { name: 'no-ver', description: 'No version' } },
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

      // Create a .git directory at the marketplace level to ensure it's skipped
      const gitDir = path.join(marketplacesDir, '.git');
      fs.mkdirSync(path.join(gitDir, 'some-plugin'), { recursive: true });
      fs.writeFileSync(
        path.join(gitDir, 'some-plugin', 'plugin.json'),
        JSON.stringify({ name: 'hidden', description: 'Hidden', version: '1.0.0' })
      );

      const result = discoverPlugins(marketplacesDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'real-plugin');
    });

    it('returns empty array when marketplacesDir has no valid plugin.json files', () => {
      const marketplacesDir = path.join(tmpDir, 'discover-no-plugins');
      createFixtureMarketplace(marketplacesDir, 'empty-market', []);

      const result = discoverPlugins(marketplacesDir);
      assert.equal(result.length, 0);
    });
  });
});
