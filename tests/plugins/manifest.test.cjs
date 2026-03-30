'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  PLUGIN_MANIFEST_SCHEMA,
  PLUGIN_STRUCTURE,
  validateManifest,
  loadManifest,
} = require('../../.claude/lib/plugins/manifest.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid manifest object. */
function makeValidManifest(overrides) {
  return Object.assign(
    {
      name: 'my-plugin',
      description: 'A test plugin',
      version: '1.0.0',
      author: { name: 'Test Author' },
    },
    overrides
  );
}

/** Writes plugin.json under pluginDir/.factory-plugin/plugin.json */
function writePluginJson(pluginDir, data) {
  const factoryDir = path.join(pluginDir, '.factory-plugin');
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.writeFileSync(path.join(factoryDir, 'plugin.json'), JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Plugin Manifest Schema', () => {
  // -------------------------------------------------------------------------
  // PLUGIN_MANIFEST_SCHEMA export
  // -------------------------------------------------------------------------
  describe('PLUGIN_MANIFEST_SCHEMA', () => {
    it('is defined and has required fields list', () => {
      assert.ok(PLUGIN_MANIFEST_SCHEMA, 'schema must be exported');
      assert.deepEqual(PLUGIN_MANIFEST_SCHEMA.required, [
        'name',
        'description',
        'version',
        'author',
      ]);
    });

    it('defines name as string', () => {
      assert.equal(PLUGIN_MANIFEST_SCHEMA.properties.name.type, 'string');
    });

    it('defines description as string', () => {
      assert.equal(PLUGIN_MANIFEST_SCHEMA.properties.description.type, 'string');
    });

    it('defines version as string', () => {
      assert.equal(PLUGIN_MANIFEST_SCHEMA.properties.version.type, 'string');
    });

    it('defines author as object with required name', () => {
      const author = PLUGIN_MANIFEST_SCHEMA.properties.author;
      assert.equal(author.type, 'object');
      assert.deepEqual(author.required, ['name']);
      assert.equal(author.properties.name.type, 'string');
    });

    it('defines author.email as optional string', () => {
      const email = PLUGIN_MANIFEST_SCHEMA.properties.author.properties.email;
      assert.ok(email, 'email property must be defined');
      assert.equal(email.type, 'string');
      // email is not in author.required, so it is optional
      assert.ok(!PLUGIN_MANIFEST_SCHEMA.properties.author.required.includes('email'));
    });
  });

  // -------------------------------------------------------------------------
  // PLUGIN_STRUCTURE export
  // -------------------------------------------------------------------------
  describe('PLUGIN_STRUCTURE', () => {
    it('exports expected subdirs array', () => {
      assert.ok(PLUGIN_STRUCTURE, 'PLUGIN_STRUCTURE must be exported');
      assert.ok(Array.isArray(PLUGIN_STRUCTURE.subdirs));
      for (const dir of ['skills', 'hooks', 'droids', 'commands']) {
        assert.ok(PLUGIN_STRUCTURE.subdirs.includes(dir), `subdirs must include ${dir}`);
      }
    });

    it('has exactly 4 subdirs', () => {
      assert.equal(PLUGIN_STRUCTURE.subdirs.length, 4);
    });
  });

  // -------------------------------------------------------------------------
  // validateManifest
  // -------------------------------------------------------------------------
  describe('validateManifest', () => {
    it('valid manifest with all fields passes (VAL-PM-001)', () => {
      const result = validateManifest(makeValidManifest());
      assert.equal(result.valid, true);
      assert.equal(result.errors, null);
    });

    it('valid manifest with optional author.email passes', () => {
      const result = validateManifest(
        makeValidManifest({ author: { name: 'Alice', email: 'alice@example.com' } })
      );
      assert.equal(result.valid, true);
      assert.equal(result.errors, null);
    });

    it('missing name field produces structured error', () => {
      const manifest = makeValidManifest();
      delete manifest.name;
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors), 'errors must be an array');
      assert.ok(result.errors.length > 0, 'must have at least one error');
    });

    it('missing description field produces structured error', () => {
      const manifest = makeValidManifest();
      delete manifest.description;
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('missing version field produces structured error', () => {
      const manifest = makeValidManifest();
      delete manifest.version;
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('missing author field produces structured error', () => {
      const manifest = makeValidManifest();
      delete manifest.author;
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('missing author.name produces structured error', () => {
      const manifest = makeValidManifest({ author: {} });
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('invalid type for name produces structured error', () => {
      const manifest = makeValidManifest({ name: 42 });
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('invalid type for author (not an object) produces structured error', () => {
      const manifest = makeValidManifest({ author: 'not-an-object' });
      const result = validateManifest(manifest);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
    });

    it('multiple missing fields produce multiple errors (allErrors mode)', () => {
      const result = validateManifest({});
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      // allErrors: true means all missing required fields are reported
      assert.ok(result.errors.length >= 4, 'should report all 4 missing required fields');
    });

    it('extra top-level properties are allowed (additionalProperties: true)', () => {
      const manifest = makeValidManifest({ extra: 'value', tags: ['cli'] });
      const result = validateManifest(manifest);
      assert.equal(result.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // loadManifest
  // -------------------------------------------------------------------------
  describe('loadManifest', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-manifest-test-'));
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // EBUSY on Windows — ignore
      }
    });

    it('reads and validates a valid plugin.json (VAL-PM-001)', () => {
      const pluginDir = path.join(tmpDir, 'valid-plugin');
      writePluginJson(pluginDir, makeValidManifest());

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, true);
      assert.equal(result.errors, null);
      assert.ok(result.manifest, 'manifest object must be returned');
      assert.equal(result.manifest.name, 'my-plugin');
    });

    it('returns valid: false when plugin.json is missing', () => {
      const pluginDir = path.join(tmpDir, 'no-plugin-json');
      fs.mkdirSync(pluginDir, { recursive: true });

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
      assert.equal(result.manifest, null);
    });

    it('returns parse error (not crash) when plugin.json has invalid JSON', () => {
      const pluginDir = path.join(tmpDir, 'invalid-json-plugin');
      const factoryDir = path.join(pluginDir, '.factory-plugin');
      fs.mkdirSync(factoryDir, { recursive: true });
      fs.writeFileSync(path.join(factoryDir, 'plugin.json'), '{ invalid json !!!', 'utf8');

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
      // Error message should describe parse failure
      assert.ok(
        result.errors[0].message.toLowerCase().includes('parse'),
        'error message must mention parse failure'
      );
      assert.equal(result.manifest, null);
    });

    it('returns valid: false for plugin.json with missing required fields', () => {
      const pluginDir = path.join(tmpDir, 'incomplete-plugin');
      writePluginJson(pluginDir, { name: 'incomplete' }); // missing description, version, author

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
      assert.equal(result.manifest, null);
    });

    it('loads plugin.json with author.email included', () => {
      const pluginDir = path.join(tmpDir, 'plugin-with-email');
      writePluginJson(
        pluginDir,
        makeValidManifest({ author: { name: 'Bob', email: 'bob@example.com' } })
      );

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, true);
      assert.equal(result.manifest.author.email, 'bob@example.com');
    });

    it('does not crash when plugin directory does not exist', () => {
      const pluginDir = path.join(tmpDir, 'nonexistent-dir-xyz');
      const result = loadManifest(pluginDir);
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.equal(result.manifest, null);
    });
  });
});
