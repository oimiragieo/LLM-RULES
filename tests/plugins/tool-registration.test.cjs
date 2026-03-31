'use strict';

/**
 * Tests for plugin tool & message registration.
 *
 * Covers:
 *   VAL-EI-004: Plugin manifest supports tool definitions
 *   VAL-EI-005: Plugin loader discovers and registers plugin tools
 *   VAL-EI-006: Plugin message injection prepends context to prompts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { validateManifest, loadManifest } = require('../../.claude/lib/plugins/manifest.cjs');
const { PluginResolver } = require('../../.claude/lib/plugins/resolver.cjs');
const { PluginLoader } = require('../../.claude/lib/plugins/loader.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid manifest object with optional overrides. */
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

/** Writes plugin.json under pluginDir/.claude-plugin/plugin.json */
function writePluginJson(pluginDir, data) {
  const claudePluginDir = path.join(pluginDir, '.claude-plugin');
  fs.mkdirSync(claudePluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudePluginDir, 'plugin.json'),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

/**
 * Create a plugin directory inside a scope directory with optional manifest and messages.
 *
 * @param {string} scopeDir   - The scope root directory
 * @param {string} pluginName - Plugin subdirectory name
 * @param {object} opts
 * @param {object} [opts.manifest]  - Manifest data to write as plugin.json
 * @param {object} [opts.messages]  - Map of filename -> content for messages/ directory
 * @returns {string} Absolute path to the plugin directory
 */
function createPluginDir(scopeDir, pluginName, opts = {}) {
  const pluginDir = path.join(scopeDir, pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });

  if (opts.manifest) {
    writePluginJson(pluginDir, opts.manifest);
  }

  if (opts.messages) {
    const messagesDir = path.join(pluginDir, 'messages');
    fs.mkdirSync(messagesDir, { recursive: true });
    for (const [filename, content] of Object.entries(opts.messages)) {
      fs.writeFileSync(path.join(messagesDir, filename), content, 'utf8');
    }
  }

  return pluginDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Plugin Tool Registration', () => {
  // -------------------------------------------------------------------------
  // VAL-EI-004: validateManifest() accepts tools array
  // -------------------------------------------------------------------------
  describe('validateManifest() — tools array (VAL-EI-004)', () => {
    it('accepts manifest without tools array (backward compat)', () => {
      const result = validateManifest(makeValidManifest());
      assert.equal(result.valid, true);
      assert.equal(result.errors, null);
    });

    it('accepts manifest with empty tools array', () => {
      const result = validateManifest(makeValidManifest({ tools: [] }));
      assert.equal(result.valid, true);
    });

    it('accepts manifest with one valid tools entry', () => {
      const result = validateManifest(
        makeValidManifest({
          tools: [{ name: 'my-tool', command: 'bin/my-tool.cjs', description: 'A CLI tool' }],
        })
      );
      assert.equal(result.valid, true);
    });

    it('accepts manifest with multiple valid tools entries', () => {
      const result = validateManifest(
        makeValidManifest({
          tools: [
            { name: 'tool-one', command: 'tools/tool-one.cjs', description: 'First tool' },
            { name: 'tool-two', command: 'tools/tool-two.cjs', description: 'Second tool' },
          ],
        })
      );
      assert.equal(result.valid, true);
    });

    it('rejects tool entry missing name field', () => {
      const result = validateManifest(
        makeValidManifest({
          tools: [{ command: 'bin/tool.cjs', description: 'Tool without name' }],
        })
      );
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.length > 0);
    });

    it('rejects tool entry missing command field', () => {
      const result = validateManifest(
        makeValidManifest({
          tools: [{ name: 'my-tool', description: 'Tool without command' }],
        })
      );
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
    });

    it('rejects tool entry missing description field', () => {
      const result = validateManifest(
        makeValidManifest({
          tools: [{ name: 'my-tool', command: 'bin/tool.cjs' }],
        })
      );
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
    });

    it('rejects tools field that is not an array', () => {
      const result = validateManifest(makeValidManifest({ tools: 'not-an-array' }));
      assert.equal(result.valid, false);
      assert.ok(Array.isArray(result.errors));
    });

    it('rejects tools field that is a plain object (not array)', () => {
      const result = validateManifest(
        makeValidManifest({ tools: { name: 'tool', command: 'cmd', description: 'desc' } })
      );
      assert.equal(result.valid, false);
    });
  });

  // -------------------------------------------------------------------------
  // VAL-EI-004: loadManifest() returns tools in parsed result
  // -------------------------------------------------------------------------
  describe('loadManifest() — returns tools in parsed result (VAL-EI-004)', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-tools-manifest-'));
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // EBUSY on Windows — ignore
      }
    });

    it('returns tools array in manifest object when present', () => {
      const pluginDir = path.join(tmpDir, 'plugin-with-tools');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [{ name: 'my-tool', command: 'bin/my-tool.cjs', description: 'A CLI tool' }],
        })
      );

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, true);
      assert.ok(result.manifest, 'manifest object must be returned');
      assert.ok(Array.isArray(result.manifest.tools), 'manifest.tools must be an array');
      assert.equal(result.manifest.tools.length, 1);
      assert.equal(result.manifest.tools[0].name, 'my-tool');
      assert.equal(result.manifest.tools[0].command, 'bin/my-tool.cjs');
      assert.equal(result.manifest.tools[0].description, 'A CLI tool');
    });

    it('returns manifest without tools when not specified (no crash)', () => {
      const pluginDir = path.join(tmpDir, 'plugin-no-tools');
      writePluginJson(pluginDir, makeValidManifest());

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, true);
      assert.ok(result.manifest, 'manifest must be returned');
      // tools is not required — may be undefined or absent
    });

    it('returns multiple tools in manifest.tools array', () => {
      const pluginDir = path.join(tmpDir, 'plugin-multi-tools');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [
            { name: 'tool-one', command: 'tools/one.cjs', description: 'One' },
            { name: 'tool-two', command: 'tools/two.cjs', description: 'Two' },
          ],
        })
      );

      const result = loadManifest(pluginDir);
      assert.equal(result.valid, true);
      assert.equal(result.manifest.tools.length, 2);
    });
  });

  // -------------------------------------------------------------------------
  // VAL-EI-005: loadTools(pluginDir) resolves commands to absolute paths
  // -------------------------------------------------------------------------
  describe('loadTools(pluginDir) (VAL-EI-005)', () => {
    let tmpDir;
    let resolver;
    let loader;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loadtools-'));
      resolver = new PluginResolver({ projectDir: tmpDir });
      loader = new PluginLoader(resolver);
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // EBUSY on Windows — ignore
      }
    });

    it('returns an array', () => {
      const pluginDir = path.join(tmpDir, 'array-plugin');
      writePluginJson(pluginDir, makeValidManifest());
      const result = loader.loadTools(pluginDir);
      assert.ok(Array.isArray(result));
    });

    it('returns empty array for plugin with no tools in manifest', () => {
      const pluginDir = path.join(tmpDir, 'no-tools-plugin');
      writePluginJson(pluginDir, makeValidManifest());
      const result = loader.loadTools(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns tool definitions for plugin with one tool', () => {
      const pluginDir = path.join(tmpDir, 'one-tool-plugin');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [{ name: 'my-tool', command: 'bin/my-tool.cjs', description: 'A CLI tool' }],
        })
      );
      const result = loader.loadTools(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'my-tool');
      assert.equal(result[0].description, 'A CLI tool');
    });

    it('resolves command to absolute path relative to pluginDir', () => {
      const pluginDir = path.join(tmpDir, 'abs-path-plugin');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [{ name: 'my-tool', command: 'bin/my-tool.cjs', description: 'A CLI tool' }],
        })
      );
      const result = loader.loadTools(pluginDir);
      assert.equal(result.length, 1);
      const expectedCmd = path.resolve(pluginDir, 'bin/my-tool.cjs');
      assert.equal(result[0].command, expectedCmd);
      assert.ok(path.isAbsolute(result[0].command), 'command must be an absolute path');
    });

    it('returns multiple tool definitions for plugin with multiple tools', () => {
      const pluginDir = path.join(tmpDir, 'multi-tools-plugin');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [
            { name: 'tool-one', command: 'tools/tool-one.cjs', description: 'First tool' },
            { name: 'tool-two', command: 'tools/tool-two.cjs', description: 'Second tool' },
          ],
        })
      );
      const result = loader.loadTools(pluginDir);
      assert.equal(result.length, 2);
      assert.equal(result[0].name, 'tool-one');
      assert.equal(result[1].name, 'tool-two');
    });

    it('resolves all commands to absolute paths for multiple tools', () => {
      const pluginDir = path.join(tmpDir, 'multi-abs-plugin');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [
            { name: 'tool-a', command: 'a/tool.cjs', description: 'Tool A' },
            { name: 'tool-b', command: 'b/tool.cjs', description: 'Tool B' },
          ],
        })
      );
      const result = loader.loadTools(pluginDir);
      for (const tool of result) {
        assert.ok(path.isAbsolute(tool.command), `command must be absolute: ${tool.command}`);
      }
    });

    it('returns empty array when plugin directory has no manifest', () => {
      const pluginDir = path.join(tmpDir, 'no-manifest-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      const result = loader.loadTools(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns empty array when plugin directory does not exist', () => {
      const pluginDir = path.join(tmpDir, 'totally-missing-plugin');
      const result = loader.loadTools(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('each returned tool has name, command, description fields', () => {
      const pluginDir = path.join(tmpDir, 'fields-check-plugin');
      writePluginJson(
        pluginDir,
        makeValidManifest({
          tools: [{ name: 'check-tool', command: 'bin/check.cjs', description: 'Check it' }],
        })
      );
      const result = loader.loadTools(pluginDir);
      assert.equal(result.length, 1);
      assert.ok('name' in result[0], 'must have name field');
      assert.ok('command' in result[0], 'must have command field');
      assert.ok('description' in result[0], 'must have description field');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-EI-005: listPluginTools() aggregates tools from all plugins
  // -------------------------------------------------------------------------
  describe('listPluginTools() (VAL-EI-005)', () => {
    let tmpDir;
    let projectDir;
    let resolver;
    let loader;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-listtools-'));
      projectDir = path.join(tmpDir, 'project');

      // Plugin A with 2 tools
      createPluginDir(projectDir, 'plugin-a', {
        manifest: makeValidManifest({
          name: 'plugin-a',
          tools: [
            { name: 'tool-alpha', command: 'bin/alpha.cjs', description: 'Alpha tool' },
            { name: 'tool-beta', command: 'bin/beta.cjs', description: 'Beta tool' },
          ],
        }),
      });

      // Plugin B with 1 tool
      createPluginDir(projectDir, 'plugin-b', {
        manifest: makeValidManifest({
          name: 'plugin-b',
          tools: [{ name: 'tool-gamma', command: 'bin/gamma.cjs', description: 'Gamma tool' }],
        }),
      });

      // Plugin C with no tools
      createPluginDir(projectDir, 'plugin-c', {
        manifest: makeValidManifest({ name: 'plugin-c' }),
      });

      resolver = new PluginResolver({ projectDir });
      loader = new PluginLoader(resolver);
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // EBUSY on Windows — ignore
      }
    });

    it('returns an array', () => {
      const tools = loader.listPluginTools();
      assert.ok(Array.isArray(tools));
    });

    it('aggregates tools from all plugins (2 + 1 + 0 = 3)', () => {
      const tools = loader.listPluginTools();
      assert.equal(tools.length, 3);
    });

    it('all tool entries have name, command, description fields', () => {
      const tools = loader.listPluginTools();
      for (const tool of tools) {
        assert.ok(typeof tool.name === 'string', `tool.name must be string`);
        assert.ok(typeof tool.command === 'string', `tool.command must be string`);
        assert.ok(typeof tool.description === 'string', `tool.description must be string`);
      }
    });

    it('all commands are absolute paths', () => {
      const tools = loader.listPluginTools();
      for (const tool of tools) {
        assert.ok(path.isAbsolute(tool.command), `command must be absolute: ${tool.command}`);
      }
    });

    it('returns empty array when no scopes are configured', () => {
      const emptyLoader = new PluginLoader(new PluginResolver({}));
      const tools = emptyLoader.listPluginTools();
      assert.ok(Array.isArray(tools));
      assert.equal(tools.length, 0);
    });

    it('includes all expected tool names from all plugins', () => {
      const tools = loader.listPluginTools();
      const names = tools.map(t => t.name);
      assert.ok(names.includes('tool-alpha'), 'must include tool-alpha');
      assert.ok(names.includes('tool-beta'), 'must include tool-beta');
      assert.ok(names.includes('tool-gamma'), 'must include tool-gamma');
    });

    it('aggregates across multiple scopes', () => {
      const userDir = path.join(tmpDir, 'user');
      createPluginDir(userDir, 'plugin-user', {
        manifest: makeValidManifest({
          name: 'plugin-user',
          tools: [{ name: 'user-tool', command: 'bin/user.cjs', description: 'User tool' }],
        }),
      });
      const multiResolver = new PluginResolver({ projectDir, userDir });
      const multiLoader = new PluginLoader(multiResolver);
      const tools = multiLoader.listPluginTools();
      assert.ok(
        tools.length >= 4,
        `should have at least 4 tools across two scopes, got ${tools.length}`
      );
      const names = tools.map(t => t.name);
      assert.ok(names.includes('user-tool'), 'must include user-tool from user scope');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-EI-006: loadMessages(pluginDir) reads messages/ directory
  // -------------------------------------------------------------------------
  describe('loadMessages(pluginDir) (VAL-EI-006)', () => {
    let tmpDir;
    let resolver;
    let loader;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-messages-'));
      resolver = new PluginResolver({ projectDir: tmpDir });
      loader = new PluginLoader(resolver);
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // EBUSY on Windows — ignore
      }
    });

    it('returns an array', () => {
      const pluginDir = path.join(tmpDir, 'arr-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
    });

    it('returns empty array when messages/ directory does not exist', () => {
      const pluginDir = path.join(tmpDir, 'no-messages-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns empty array when messages/ directory is empty', () => {
      const pluginDir = path.join(tmpDir, 'empty-messages-plugin');
      fs.mkdirSync(path.join(pluginDir, 'messages'), { recursive: true });
      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('returns one message object when messages/ has one file', () => {
      const pluginDir = path.join(tmpDir, 'one-message-plugin');
      const messagesDir = path.join(pluginDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });
      fs.writeFileSync(
        path.join(messagesDir, 'context.md'),
        '# Context\nSome context here.',
        'utf8'
      );

      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].filename, 'context.md');
      assert.equal(result[0].content, '# Context\nSome context here.');
    });

    it('returns multiple message objects for multiple files', () => {
      const pluginDir = path.join(tmpDir, 'multi-messages-plugin');
      const messagesDir = path.join(pluginDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });
      fs.writeFileSync(path.join(messagesDir, 'context.md'), 'Context content', 'utf8');
      fs.writeFileSync(path.join(messagesDir, 'instructions.md'), 'Instructions content', 'utf8');

      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 2);

      const filenames = result.map(m => m.filename);
      assert.ok(filenames.includes('context.md'), 'must include context.md');
      assert.ok(filenames.includes('instructions.md'), 'must include instructions.md');
    });

    it('each message object has filename and content string fields', () => {
      const pluginDir = path.join(tmpDir, 'fields-messages-plugin');
      const messagesDir = path.join(pluginDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });
      fs.writeFileSync(path.join(messagesDir, 'test.txt'), 'Test content', 'utf8');

      const result = loader.loadMessages(pluginDir);
      assert.equal(result.length, 1);
      assert.ok('filename' in result[0], 'must have filename field');
      assert.ok('content' in result[0], 'must have content field');
      assert.equal(typeof result[0].filename, 'string');
      assert.equal(typeof result[0].content, 'string');
    });

    it('content matches the actual file contents on disk', () => {
      const pluginDir = path.join(tmpDir, 'content-check-plugin');
      const messagesDir = path.join(pluginDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });
      const expectedContent = '# My Message\nThis is a special message.';
      fs.writeFileSync(path.join(messagesDir, 'my-message.md'), expectedContent, 'utf8');

      const result = loader.loadMessages(pluginDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].content, expectedContent);
    });

    it('returns empty array for non-existent plugin directory (no throw)', () => {
      const pluginDir = path.join(tmpDir, 'nonexistent-xyz-plugin');
      assert.doesNotThrow(() => loader.loadMessages(pluginDir));
      const result = loader.loadMessages(pluginDir);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('does not include subdirectories in messages/ results', () => {
      const pluginDir = path.join(tmpDir, 'subdir-messages-plugin');
      const messagesDir = path.join(pluginDir, 'messages');
      fs.mkdirSync(messagesDir, { recursive: true });
      fs.writeFileSync(path.join(messagesDir, 'file.md'), 'File content', 'utf8');
      // Create a subdirectory — should be ignored
      fs.mkdirSync(path.join(messagesDir, 'subdir'), { recursive: true });

      const result = loader.loadMessages(pluginDir);
      // Only the file should appear, not the subdirectory
      assert.equal(result.length, 1);
      assert.equal(result[0].filename, 'file.md');
    });
  });
});
