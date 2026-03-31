#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 3
 * ========================================
 *
 * VAL-CROSS-007: GitHub integration uses renamed plugin API
 *   GitHubCLI or MentionParser code references resolveAgent (not resolveDroid)
 *   if loading plugin-provided agents. Nomenclature cleanup is consistent
 *   across all new and existing code.
 *
 *   Concretely:
 *   1. Verify the renamed plugin API (resolveAgent, loadAgent) works end-to-end.
 *      Create a mock plugin with an agent .md file in agents/ subdirectory
 *      (not droids/), load it via PluginLoader.loadAgent(), verify content
 *      is returned.
 *   2. Grep-based verification that no .claude/lib/github/*.cjs files contain
 *      'droid' strings — confirming the nomenclature cleanup is consistent
 *      across GitHub integration code.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { PluginResolver } = require('../../.claude/lib/plugins/resolver.cjs');
const { PluginLoader } = require('../../.claude/lib/plugins/loader.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock plugin inside a scope directory with an agents/
 * subdirectory (not droids/).
 *
 * @param {string} scopeDir   - The scope root directory
 * @param {string} pluginName - Plugin subdirectory name
 * @param {object} opts
 * @param {string[]} [opts.agents]        - Agent names to create (.md files)
 * @param {object}  [opts.agentContents]  - Map of agentName -> content override
 */
function createMockPlugin(scopeDir, pluginName, opts = {}) {
  const pluginDir = path.join(scopeDir, pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });

  if (opts.agents && opts.agents.length > 0) {
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const agent of opts.agents) {
      const content =
        (opts.agentContents && opts.agentContents[agent]) ||
        `# Agent: ${agent}\nThis is the ${agent} agent.\n`;
      fs.writeFileSync(path.join(agentsDir, `${agent}.md`), content, 'utf8');
    }
  }
}

// Absolute path to the github lib directory
const GITHUB_LIB_DIR = path.join(__dirname, '..', '..', '.claude', 'lib', 'github');

// ---------------------------------------------------------------------------
// VAL-CROSS-007: Renamed plugin API (resolveAgent / loadAgent) works end-to-end
// ---------------------------------------------------------------------------

describe('VAL-CROSS-007: Renamed plugin API works end-to-end (agents/ subdirectory)', () => {
  let tmpDir;
  let projectDir;
  let resolver;
  let loader;

  const AGENT_NAME = 'my-cross-agent';
  const AGENT_CONTENT = '# My Cross Agent\nThis agent validates cross-area nomenclature.\n';

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-area-007-'));
    projectDir = path.join(tmpDir, 'project-scope');

    // Create a mock plugin with an agent .md file inside agents/ (not droids/)
    createMockPlugin(projectDir, 'plugin-cross-test', {
      agents: [AGENT_NAME],
      agentContents: {
        [AGENT_NAME]: AGENT_CONTENT,
      },
    });

    resolver = new PluginResolver({ projectDir });
    loader = new PluginLoader(resolver);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // Ignore EBUSY on Windows
    }
  });

  it('mock plugin agents/ directory is created correctly (not droids/)', () => {
    const agentsDir = path.join(projectDir, 'plugin-cross-test', 'agents');
    assert.ok(fs.existsSync(agentsDir), 'agents/ subdirectory should exist');

    // Confirm no droids/ directory was created
    const droidsDir = path.join(projectDir, 'plugin-cross-test', 'droids');
    assert.ok(!fs.existsSync(droidsDir), 'droids/ subdirectory must NOT exist');
  });

  it('agent .md file exists in agents/ subdirectory', () => {
    const agentFile = path.join(projectDir, 'plugin-cross-test', 'agents', `${AGENT_NAME}.md`);
    assert.ok(fs.existsSync(agentFile), `agent file ${AGENT_NAME}.md should exist in agents/`);
  });

  it('PluginResolver.resolveAgent() locates the agent by name', () => {
    const agentPath = resolver.resolveAgent(AGENT_NAME);
    assert.ok(agentPath !== null, 'resolveAgent should return a path, not null');
    assert.ok(typeof agentPath === 'string', 'resolveAgent should return a string path');
  });

  it('resolveAgent() returns the correct path inside agents/ directory', () => {
    const agentPath = resolver.resolveAgent(AGENT_NAME);
    assert.ok(agentPath !== null);
    assert.ok(
      agentPath.includes('agents'),
      `resolved path should include 'agents' directory: ${agentPath}`
    );
    assert.ok(
      !agentPath.includes('droids'),
      `resolved path must NOT include 'droids': ${agentPath}`
    );
  });

  it('PluginLoader.loadAgent() returns an object with content (VAL-CROSS-007)', () => {
    const result = loader.loadAgent(AGENT_NAME);
    assert.ok(result !== null, 'loadAgent should return a result, not null');
    assert.ok(typeof result.content === 'string', 'result must have a content string');
    assert.ok(result.content.length > 0, 'content must not be empty');
  });

  it('loadAgent() content matches the original agent .md file', () => {
    const result = loader.loadAgent(AGENT_NAME);
    assert.ok(result !== null);
    assert.strictEqual(
      result.content,
      AGENT_CONTENT,
      'loaded content should match the original agent .md content'
    );
  });

  it('loadAgent() result includes a valid path', () => {
    const result = loader.loadAgent(AGENT_NAME);
    assert.ok(result !== null);
    assert.ok(typeof result.path === 'string', 'result must include a path');
    assert.ok(fs.existsSync(result.path), 'path in result must point to an existing file');
  });

  it('loadAgent() returns null for a non-existent agent (no crash)', () => {
    assert.doesNotThrow(() => loader.loadAgent('nonexistent-agent'));
    const result = loader.loadAgent('nonexistent-agent');
    assert.strictEqual(result, null, 'should return null for a missing agent');
  });

  it('end-to-end: resolver and loader wire together without errors', () => {
    assert.doesNotThrow(() => {
      const agentPath = resolver.resolveAgent(AGENT_NAME);
      assert.ok(agentPath !== null, 'resolver must find the agent');

      const loaded = loader.loadAgent(AGENT_NAME);
      assert.ok(loaded !== null, 'loader must return content');
      assert.ok(loaded.content.includes('My Cross Agent'), 'content should match agent name');
    });
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-007: GitHub integration code uses renamed API (no 'droid' strings)
// ---------------------------------------------------------------------------

describe('VAL-CROSS-007: GitHub integration code contains no droid references', () => {
  it('github lib directory exists', () => {
    assert.ok(
      fs.existsSync(GITHUB_LIB_DIR),
      `GitHub lib directory should exist at ${GITHUB_LIB_DIR}`
    );
  });

  it('no .cjs file in .claude/lib/github/ contains the string "droid"', () => {
    const cjsFiles = fs
      .readdirSync(GITHUB_LIB_DIR)
      .filter(f => f.endsWith('.cjs'))
      .map(f => path.join(GITHUB_LIB_DIR, f));

    assert.ok(cjsFiles.length > 0, 'There should be at least one .cjs file in the github lib');

    const violations = [];
    for (const filePath of cjsFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Case-insensitive check for any 'droid' occurrence
      if (/droid/i.test(content)) {
        // Collect all matching lines for reporting
        const lines = content.split('\n');
        const matchingLines = lines
          .map((line, idx) => ({ line: idx + 1, text: line }))
          .filter(({ text }) => /droid/i.test(text));
        violations.push({ file: path.basename(filePath), matches: matchingLines });
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found 'droid' references in GitHub integration files:\n` +
        violations
          .map(
            v =>
              `  ${v.file}:\n` +
              v.matches.map(m => `    line ${m.line}: ${m.text.trim()}`).join('\n')
          )
          .join('\n')
    );
  });

  it('github lib files use resolveAgent pattern (not resolveDroid)', () => {
    const cjsFiles = fs
      .readdirSync(GITHUB_LIB_DIR)
      .filter(f => f.endsWith('.cjs'))
      .map(f => path.join(GITHUB_LIB_DIR, f));

    for (const filePath of cjsFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        !content.includes('resolveDroid'),
        `${path.basename(filePath)} must not reference resolveDroid`
      );
      assert.ok(
        !content.includes('loadDroid'),
        `${path.basename(filePath)} must not reference loadDroid`
      );
    }
  });

  it('all expected github lib files are present', () => {
    const expectedFiles = [
      'cli-client.cjs',
      'webhook-simulator.cjs',
      'mention-parser.cjs',
      'task-dispatcher.cjs',
      'ci-status-reporter.cjs',
    ];

    for (const expectedFile of expectedFiles) {
      const filePath = path.join(GITHUB_LIB_DIR, expectedFile);
      assert.ok(
        fs.existsSync(filePath),
        `Expected GitHub integration file to exist: ${expectedFile}`
      );
    }
  });
});
