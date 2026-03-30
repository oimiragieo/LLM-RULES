'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { PluginRegistry } = require('../../.claude/lib/plugins/registry.cjs');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginRegistry', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-registry-test-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows — ignore
    }
  });

  // -------------------------------------------------------------------------
  // loadInstalled
  // -------------------------------------------------------------------------
  describe('loadInstalled()', () => {
    it('returns empty array when installed_plugins.json does not exist', () => {
      const dir = path.join(tmpDir, 'li-1');
      const r = new PluginRegistry(dir);
      const result = r.loadInstalled();
      assert.ok(Array.isArray(result), 'result must be an array');
      assert.equal(result.length, 0);
    });

    it('returns array of installed plugins from installed_plugins.json', () => {
      const dir = path.join(tmpDir, 'li-2');
      fs.mkdirSync(dir, { recursive: true });
      const entry = {
        id: 'my-plugin',
        version: 'abc123',
        installedAt: '2025-01-01T00:00:00.000Z',
        scope: 'user',
      };
      fs.writeFileSync(
        path.join(dir, 'installed_plugins.json'),
        JSON.stringify([entry], null, 2),
        'utf8'
      );
      const r = new PluginRegistry(dir);
      const result = r.loadInstalled();
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'my-plugin');
    });
  });

  // -------------------------------------------------------------------------
  // install
  // -------------------------------------------------------------------------
  describe('install()', () => {
    it('adds entry with id, version, installedAt, scope to installed_plugins.json (VAL-PM-002)', () => {
      const dir = path.join(tmpDir, 'inst-1');
      const r = new PluginRegistry(dir);
      r.install('test-plugin', 'user', { version: 'abc123' });
      const installed = r.loadInstalled();
      assert.equal(installed.length, 1);
      const entry = installed[0];
      assert.equal(entry.id, 'test-plugin');
      assert.equal(entry.version, 'abc123');
      assert.equal(entry.scope, 'user');
      assert.ok(entry.installedAt, 'installedAt must be present');
      // Verify installedAt is a valid ISO timestamp
      assert.ok(!Number.isNaN(Date.parse(entry.installedAt)), 'installedAt must be valid ISO date');
    });

    it('creates registryDir if it does not exist', () => {
      const dir = path.join(tmpDir, 'inst-2-new-dir');
      assert.ok(!fs.existsSync(dir), 'dir should not exist yet');
      const r = new PluginRegistry(dir);
      r.install('new-plugin', 'project', {});
      assert.ok(fs.existsSync(dir), 'dir should have been created');
    });

    it('allows installing multiple plugins', () => {
      const dir = path.join(tmpDir, 'inst-3');
      const r = new PluginRegistry(dir);
      r.install('plugin-a', 'user', { version: '1.0.0' });
      r.install('plugin-b', 'project', { version: '2.0.0' });
      const installed = r.loadInstalled();
      assert.equal(installed.length, 2);
      const ids = installed.map(e => e.id);
      assert.ok(ids.includes('plugin-a'));
      assert.ok(ids.includes('plugin-b'));
    });

    it('updates existing entry when same pluginId installed again', () => {
      const dir = path.join(tmpDir, 'inst-4');
      const r = new PluginRegistry(dir);
      r.install('update-plugin', 'user', { version: '1.0.0' });
      r.install('update-plugin', 'user', { version: '2.0.0' });
      const installed = r.loadInstalled();
      assert.equal(installed.length, 1, 'should not duplicate entry');
      assert.equal(installed[0].version, '2.0.0');
    });

    it('writes installed_plugins.json atomically — valid JSON on disk after install', () => {
      const dir = path.join(tmpDir, 'inst-5');
      const r = new PluginRegistry(dir);
      r.install('atomic-plugin', 'org', { version: 'def456' });
      const filePath = path.join(dir, 'installed_plugins.json');
      assert.ok(fs.existsSync(filePath), 'installed_plugins.json must exist');
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(Array.isArray(content), 'content must be valid JSON array');
    });

    it('install with empty metadata still records id and scope', () => {
      const dir = path.join(tmpDir, 'inst-6');
      const r = new PluginRegistry(dir);
      r.install('minimal-plugin', 'org', {});
      const installed = r.loadInstalled();
      assert.equal(installed.length, 1);
      assert.equal(installed[0].id, 'minimal-plugin');
      assert.equal(installed[0].scope, 'org');
    });
  });

  // -------------------------------------------------------------------------
  // uninstall
  // -------------------------------------------------------------------------
  describe('uninstall()', () => {
    it('removes an entry from installed_plugins.json (VAL-PM-002)', () => {
      const dir = path.join(tmpDir, 'uninst-1');
      const r = new PluginRegistry(dir);
      r.install('to-remove', 'user', { version: '1.0.0' });
      assert.equal(r.isInstalled('to-remove'), true);
      r.uninstall('to-remove');
      assert.equal(r.isInstalled('to-remove'), false);
    });

    it('does not throw when pluginId does not exist', () => {
      const dir = path.join(tmpDir, 'uninst-2');
      const r = new PluginRegistry(dir);
      assert.doesNotThrow(() => r.uninstall('nonexistent'));
    });

    it('leaves other plugins intact after uninstall', () => {
      const dir = path.join(tmpDir, 'uninst-3');
      const r = new PluginRegistry(dir);
      r.install('keep-plugin', 'user', { version: '1.0.0' });
      r.install('remove-plugin', 'user', { version: '1.0.0' });
      r.uninstall('remove-plugin');
      const installed = r.loadInstalled();
      assert.equal(installed.length, 1);
      assert.equal(installed[0].id, 'keep-plugin');
    });

    it('uninstall on empty registry does not throw', () => {
      const dir = path.join(tmpDir, 'uninst-4');
      const r = new PluginRegistry(dir);
      assert.doesNotThrow(() => r.uninstall('anything'));
    });
  });

  // -------------------------------------------------------------------------
  // isInstalled
  // -------------------------------------------------------------------------
  describe('isInstalled()', () => {
    it('returns false when plugin is not installed', () => {
      const dir = path.join(tmpDir, 'isinst-1');
      const r = new PluginRegistry(dir);
      assert.equal(r.isInstalled('unknown-plugin'), false);
    });

    it('returns true when plugin is installed (VAL-PM-002)', () => {
      const dir = path.join(tmpDir, 'isinst-2');
      const r = new PluginRegistry(dir);
      r.install('exists-plugin', 'user', { version: '1.0.0' });
      assert.equal(r.isInstalled('exists-plugin'), true);
    });

    it('returns false after plugin is uninstalled', () => {
      const dir = path.join(tmpDir, 'isinst-3');
      const r = new PluginRegistry(dir);
      r.install('temp-plugin', 'user', { version: '1.0.0' });
      r.uninstall('temp-plugin');
      assert.equal(r.isInstalled('temp-plugin'), false);
    });
  });

  // -------------------------------------------------------------------------
  // loadMarketplaces
  // -------------------------------------------------------------------------
  describe('loadMarketplaces()', () => {
    it('returns empty array when known_marketplaces.json does not exist', () => {
      const dir = path.join(tmpDir, 'mkt-load-1');
      const r = new PluginRegistry(dir);
      const result = r.loadMarketplaces();
      assert.ok(Array.isArray(result), 'result must be an array');
      assert.equal(result.length, 0);
    });

    it('returns array of marketplaces from known_marketplaces.json', () => {
      const dir = path.join(tmpDir, 'mkt-load-2');
      fs.mkdirSync(dir, { recursive: true });
      const entry = {
        name: 'official',
        url: 'https://github.com/example/plugins',
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };
      fs.writeFileSync(
        path.join(dir, 'known_marketplaces.json'),
        JSON.stringify([entry], null, 2),
        'utf8'
      );
      const r = new PluginRegistry(dir);
      const result = r.loadMarketplaces();
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'official');
    });
  });

  // -------------------------------------------------------------------------
  // addMarketplace
  // -------------------------------------------------------------------------
  describe('addMarketplace()', () => {
    it('adds entry with name, url, lastUpdated to known_marketplaces.json (VAL-PM-002)', () => {
      const dir = path.join(tmpDir, 'mkt-add-1');
      const r = new PluginRegistry(dir);
      r.addMarketplace('my-market', 'https://github.com/example/market');
      const marketplaces = r.loadMarketplaces();
      assert.equal(marketplaces.length, 1);
      const m = marketplaces[0];
      assert.equal(m.name, 'my-market');
      assert.equal(m.url, 'https://github.com/example/market');
      assert.ok(m.lastUpdated, 'lastUpdated must be present');
      assert.ok(!Number.isNaN(Date.parse(m.lastUpdated)), 'lastUpdated must be valid ISO date');
    });

    it('creates registryDir if it does not exist', () => {
      const dir = path.join(tmpDir, 'mkt-add-2-new-dir');
      assert.ok(!fs.existsSync(dir));
      const r = new PluginRegistry(dir);
      r.addMarketplace('test', 'https://example.com');
      assert.ok(fs.existsSync(dir));
    });

    it('allows adding multiple marketplaces', () => {
      const dir = path.join(tmpDir, 'mkt-add-3');
      const r = new PluginRegistry(dir);
      r.addMarketplace('market-a', 'https://example.com/a');
      r.addMarketplace('market-b', 'https://example.com/b');
      const marketplaces = r.loadMarketplaces();
      assert.equal(marketplaces.length, 2);
    });

    it('updates existing entry when same name added again', () => {
      const dir = path.join(tmpDir, 'mkt-add-4');
      const r = new PluginRegistry(dir);
      r.addMarketplace('same-market', 'https://example.com/v1');
      r.addMarketplace('same-market', 'https://example.com/v2');
      const marketplaces = r.loadMarketplaces();
      assert.equal(marketplaces.length, 1, 'should not duplicate entry');
      assert.equal(marketplaces[0].url, 'https://example.com/v2');
    });

    it('writes known_marketplaces.json atomically — valid JSON on disk after add', () => {
      const dir = path.join(tmpDir, 'mkt-add-5');
      const r = new PluginRegistry(dir);
      r.addMarketplace('atomic-market', 'https://example.com');
      const filePath = path.join(dir, 'known_marketplaces.json');
      assert.ok(fs.existsSync(filePath), 'known_marketplaces.json must exist');
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(Array.isArray(content), 'content must be valid JSON array');
    });
  });

  // -------------------------------------------------------------------------
  // removeMarketplace
  // -------------------------------------------------------------------------
  describe('removeMarketplace()', () => {
    it('removes an entry from known_marketplaces.json (VAL-PM-002)', () => {
      const dir = path.join(tmpDir, 'mkt-rm-1');
      const r = new PluginRegistry(dir);
      r.addMarketplace('to-remove-market', 'https://example.com');
      assert.equal(r.loadMarketplaces().length, 1);
      r.removeMarketplace('to-remove-market');
      assert.equal(r.loadMarketplaces().length, 0);
    });

    it('does not throw when marketplace name does not exist', () => {
      const dir = path.join(tmpDir, 'mkt-rm-2');
      const r = new PluginRegistry(dir);
      assert.doesNotThrow(() => r.removeMarketplace('nonexistent'));
    });

    it('leaves other marketplaces intact after remove', () => {
      const dir = path.join(tmpDir, 'mkt-rm-3');
      const r = new PluginRegistry(dir);
      r.addMarketplace('keep-market', 'https://example.com/keep');
      r.addMarketplace('remove-market', 'https://example.com/remove');
      r.removeMarketplace('remove-market');
      const marketplaces = r.loadMarketplaces();
      assert.equal(marketplaces.length, 1);
      assert.equal(marketplaces[0].name, 'keep-market');
    });

    it('removeMarketplace on empty registry does not throw', () => {
      const dir = path.join(tmpDir, 'mkt-rm-4');
      const r = new PluginRegistry(dir);
      assert.doesNotThrow(() => r.removeMarketplace('anything'));
    });
  });
});
