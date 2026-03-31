'use strict';

/**
 * Tests for .claude/lib/plugins/cli.cjs
 *
 * Covers VAL-PM-004: CLI install and uninstall update registry
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  listPlugins,
} = require('../../.claude/lib/plugins/cli.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal valid plugin directory in targetDir with:
 *   .claude-plugin/plugin.json (valid manifest)
 *   skills/example.md
 */
function createFakePlugin(targetDir, overrides = {}) {
  const manifest = {
    name: overrides.name || 'test-plugin',
    description: overrides.description || 'A test plugin',
    version: overrides.version || '1.0.0',
    author: { name: overrides.authorName || 'Test Author' },
  };
  const claudePluginDir = path.join(targetDir, '.claude-plugin');
  fs.mkdirSync(claudePluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudePluginDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
  // Add a skills file so we can verify copy happened
  const skillsDir = path.join(targetDir, 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'example.md'), '# Example skill\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Plugin CLI', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-cli-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows — ignore
    }
  });

  // -------------------------------------------------------------------------
  // installPlugin
  // -------------------------------------------------------------------------
  describe('installPlugin()', () => {
    it('copies plugin files to pluginsDir/<scope>/<pluginId> (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'inst-copy-1-registry');
      const pluginsDir = path.join(tmpDir, 'inst-copy-1-plugins');
      const sourceDir = path.join(tmpDir, 'inst-copy-1-source');

      createFakePlugin(sourceDir);
      installPlugin({ pluginId: 'my-plugin', scope: 'user', registryDir, pluginsDir, sourceDir });

      const destDir = path.join(pluginsDir, 'user', 'my-plugin');
      assert.ok(fs.existsSync(destDir), 'plugin destination directory should exist');
      const manifestPath = path.join(destDir, '.claude-plugin', 'plugin.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest should be copied');
      const skillsPath = path.join(destDir, 'skills', 'example.md');
      assert.ok(fs.existsSync(skillsPath), 'skills file should be copied');
    });

    it('adds entry to installed_plugins.json with id, version, scope, installedAt (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'inst-reg-1-registry');
      const pluginsDir = path.join(tmpDir, 'inst-reg-1-plugins');
      const sourceDir = path.join(tmpDir, 'inst-reg-1-source');

      createFakePlugin(sourceDir, { name: 'reg-plugin', version: '2.0.0' });
      installPlugin({
        pluginId: 'reg-plugin',
        scope: 'project',
        registryDir,
        pluginsDir,
        sourceDir,
      });

      const registryFile = path.join(registryDir, 'installed_plugins.json');
      assert.ok(fs.existsSync(registryFile), 'installed_plugins.json should exist');
      const entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      assert.equal(entries.length, 1);
      const entry = entries[0];
      assert.equal(entry.id, 'reg-plugin');
      assert.equal(entry.scope, 'project');
      assert.equal(entry.version, '2.0.0', 'version should come from manifest');
      assert.ok(entry.installedAt, 'installedAt must be present');
      assert.ok(!Number.isNaN(Date.parse(entry.installedAt)), 'installedAt must be valid ISO date');
    });

    it('is idempotent — double install does not throw and updates entry (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'inst-idem-1-registry');
      const pluginsDir = path.join(tmpDir, 'inst-idem-1-plugins');
      const sourceDir = path.join(tmpDir, 'inst-idem-1-source');

      createFakePlugin(sourceDir, { version: '1.0.0' });
      installPlugin({ pluginId: 'idem-plugin', scope: 'user', registryDir, pluginsDir, sourceDir });

      // Second install - idempotent
      assert.doesNotThrow(() => {
        installPlugin({
          pluginId: 'idem-plugin',
          scope: 'user',
          registryDir,
          pluginsDir,
          sourceDir,
        });
      }, 'double install must not throw');

      const registryFile = path.join(registryDir, 'installed_plugins.json');
      const entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      assert.equal(entries.length, 1, 'should not duplicate registry entry');
    });

    it('throws if manifest is invalid (missing required fields)', () => {
      const registryDir = path.join(tmpDir, 'inst-bad-1-registry');
      const pluginsDir = path.join(tmpDir, 'inst-bad-1-plugins');
      const sourceDir = path.join(tmpDir, 'inst-bad-1-source');

      // Create invalid plugin (no manifest)
      fs.mkdirSync(sourceDir, { recursive: true });

      assert.throws(
        () =>
          installPlugin({
            pluginId: 'bad-plugin',
            scope: 'user',
            registryDir,
            pluginsDir,
            sourceDir,
          }),
        /manifest/i,
        'should throw with manifest-related error for missing manifest'
      );
    });

    it('creates pluginsDir and registryDir if they do not exist', () => {
      const registryDir = path.join(tmpDir, 'inst-mkdir-1-registry');
      const pluginsDir = path.join(tmpDir, 'inst-mkdir-1-plugins');
      const sourceDir = path.join(tmpDir, 'inst-mkdir-1-source');

      createFakePlugin(sourceDir);
      assert.ok(!fs.existsSync(registryDir), 'registryDir should not exist yet');
      assert.ok(!fs.existsSync(pluginsDir), 'pluginsDir should not exist yet');

      installPlugin({ pluginId: 'new-plugin', scope: 'org', registryDir, pluginsDir, sourceDir });

      assert.ok(fs.existsSync(registryDir), 'registryDir should have been created');
      assert.ok(
        fs.existsSync(path.join(pluginsDir, 'org', 'new-plugin')),
        'plugin destination dir should have been created'
      );
    });
  });

  // -------------------------------------------------------------------------
  // uninstallPlugin
  // -------------------------------------------------------------------------
  describe('uninstallPlugin()', () => {
    it('removes plugin files from pluginsDir/<scope>/<pluginId> (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'uninst-files-1-registry');
      const pluginsDir = path.join(tmpDir, 'uninst-files-1-plugins');
      const sourceDir = path.join(tmpDir, 'uninst-files-1-source');

      createFakePlugin(sourceDir);
      installPlugin({
        pluginId: 'del-plugin',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir,
      });

      const destDir = path.join(pluginsDir, 'user', 'del-plugin');
      assert.ok(fs.existsSync(destDir), 'plugin should be installed first');

      uninstallPlugin({ pluginId: 'del-plugin', registryDir, pluginsDir });

      assert.ok(!fs.existsSync(destDir), 'plugin directory should have been removed');
    });

    it('removes registry entry from installed_plugins.json (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'uninst-reg-1-registry');
      const pluginsDir = path.join(tmpDir, 'uninst-reg-1-plugins');
      const sourceDir = path.join(tmpDir, 'uninst-reg-1-source');

      createFakePlugin(sourceDir);
      installPlugin({
        pluginId: 'reg-del-plugin',
        scope: 'project',
        registryDir,
        pluginsDir,
        sourceDir,
      });

      // Verify it was registered
      const registryFile = path.join(registryDir, 'installed_plugins.json');
      let entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      assert.equal(entries.length, 1);

      uninstallPlugin({ pluginId: 'reg-del-plugin', registryDir, pluginsDir });

      entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      assert.equal(entries.length, 0, 'registry entry should be removed');
    });

    it('is idempotent — double uninstall does not throw (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'uninst-idem-1-registry');
      const pluginsDir = path.join(tmpDir, 'uninst-idem-1-plugins');
      const sourceDir = path.join(tmpDir, 'uninst-idem-1-source');

      createFakePlugin(sourceDir);
      installPlugin({
        pluginId: 'idem-del-plugin',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir,
      });
      uninstallPlugin({ pluginId: 'idem-del-plugin', registryDir, pluginsDir });

      // Second uninstall — must not throw
      assert.doesNotThrow(() => {
        uninstallPlugin({ pluginId: 'idem-del-plugin', registryDir, pluginsDir });
      }, 'double uninstall must not throw');
    });

    it('does not throw when plugin was never installed', () => {
      const registryDir = path.join(tmpDir, 'uninst-never-1-registry');
      const pluginsDir = path.join(tmpDir, 'uninst-never-1-plugins');

      assert.doesNotThrow(() => {
        uninstallPlugin({ pluginId: 'never-existed', registryDir, pluginsDir });
      }, 'uninstall of non-existent plugin must not throw');
    });

    it('leaves other plugins intact after uninstall', () => {
      const registryDir = path.join(tmpDir, 'uninst-other-1-registry');
      const pluginsDir = path.join(tmpDir, 'uninst-other-1-plugins');
      const sourceA = path.join(tmpDir, 'uninst-other-1-srcA');
      const sourceB = path.join(tmpDir, 'uninst-other-1-srcB');

      createFakePlugin(sourceA, { name: 'plugin-a' });
      createFakePlugin(sourceB, { name: 'plugin-b' });
      installPlugin({
        pluginId: 'plugin-a',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir: sourceA,
      });
      installPlugin({
        pluginId: 'plugin-b',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir: sourceB,
      });
      uninstallPlugin({ pluginId: 'plugin-a', registryDir, pluginsDir });

      // plugin-b should still exist
      const destB = path.join(pluginsDir, 'user', 'plugin-b');
      assert.ok(fs.existsSync(destB), 'plugin-b should still be installed');

      const registryFile = path.join(registryDir, 'installed_plugins.json');
      const entries = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, 'plugin-b');
    });
  });

  // -------------------------------------------------------------------------
  // listPlugins
  // -------------------------------------------------------------------------
  describe('listPlugins()', () => {
    it('returns empty array when no plugins are installed', () => {
      const registryDir = path.join(tmpDir, 'list-empty-1');
      const result = listPlugins(registryDir);
      assert.ok(Array.isArray(result), 'must return an array');
      assert.equal(result.length, 0);
    });

    it('returns correct installed plugins (VAL-PM-004)', () => {
      const registryDir = path.join(tmpDir, 'list-correct-1-registry');
      const pluginsDir = path.join(tmpDir, 'list-correct-1-plugins');
      const srcA = path.join(tmpDir, 'list-correct-1-srcA');
      const srcB = path.join(tmpDir, 'list-correct-1-srcB');

      createFakePlugin(srcA, { name: 'plugin-alpha', version: '1.2.3' });
      createFakePlugin(srcB, { name: 'plugin-beta', version: '2.0.0' });
      installPlugin({
        pluginId: 'plugin-alpha',
        scope: 'project',
        registryDir,
        pluginsDir,
        sourceDir: srcA,
      });
      installPlugin({
        pluginId: 'plugin-beta',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir: srcB,
      });

      const result = listPlugins(registryDir);
      assert.ok(Array.isArray(result), 'must return an array');
      assert.equal(result.length, 2, 'should return 2 plugins');

      const ids = result.map(e => e.id);
      assert.ok(ids.includes('plugin-alpha'), 'should include plugin-alpha');
      assert.ok(ids.includes('plugin-beta'), 'should include plugin-beta');
    });

    it('each returned entry has id, version, scope, installedAt fields', () => {
      const registryDir = path.join(tmpDir, 'list-fields-1-registry');
      const pluginsDir = path.join(tmpDir, 'list-fields-1-plugins');
      const src = path.join(tmpDir, 'list-fields-1-src');

      createFakePlugin(src, { name: 'field-plugin', version: '3.1.0' });
      installPlugin({
        pluginId: 'field-plugin',
        scope: 'org',
        registryDir,
        pluginsDir,
        sourceDir: src,
      });

      const result = listPlugins(registryDir);
      assert.equal(result.length, 1);
      const entry = result[0];
      assert.ok('id' in entry, 'entry must have id');
      assert.ok('version' in entry, 'entry must have version');
      assert.ok('scope' in entry, 'entry must have scope');
      assert.ok('installedAt' in entry, 'entry must have installedAt');
      assert.equal(entry.version, '3.1.0');
      assert.equal(entry.scope, 'org');
    });

    it('reflects state after uninstall', () => {
      const registryDir = path.join(tmpDir, 'list-after-uninst-1-registry');
      const pluginsDir = path.join(tmpDir, 'list-after-uninst-1-plugins');
      const src = path.join(tmpDir, 'list-after-uninst-1-src');

      createFakePlugin(src);
      installPlugin({
        pluginId: 'temp-plugin',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir: src,
      });
      assert.equal(listPlugins(registryDir).length, 1);

      uninstallPlugin({ pluginId: 'temp-plugin', registryDir, pluginsDir });
      assert.equal(listPlugins(registryDir).length, 0, 'listPlugins should reflect uninstall');
    });
  });

  // -------------------------------------------------------------------------
  // updatePlugin
  // -------------------------------------------------------------------------
  describe('updatePlugin()', () => {
    it('returns plugin info when plugin is installed', () => {
      const registryDir = path.join(tmpDir, 'update-installed-1-registry');
      const pluginsDir = path.join(tmpDir, 'update-installed-1-plugins');
      const src = path.join(tmpDir, 'update-installed-1-src');

      createFakePlugin(src, { name: 'update-plugin', version: '1.0.0' });
      installPlugin({
        pluginId: 'update-plugin',
        scope: 'user',
        registryDir,
        pluginsDir,
        sourceDir: src,
      });

      const result = updatePlugin({ pluginId: 'update-plugin', registryDir });
      assert.ok(result, 'updatePlugin should return a result');
      assert.equal(result.id, 'update-plugin', 'result should include pluginId');
    });

    it('throws or returns error info when plugin is not installed', () => {
      const registryDir = path.join(tmpDir, 'update-missing-1-registry');

      assert.throws(
        () => updatePlugin({ pluginId: 'not-installed', registryDir }),
        /not installed|not found/i,
        'should throw when plugin is not installed'
      );
    });
  });
});
