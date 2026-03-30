'use strict';

/**
 * Tests for .claude/lib/plugins/loader.cjs
 *
 * Covers VAL-PM-006: Plugin skills and hooks loaded into runtime
 *
 * Tests:
 * - loadSkill(skillName) finds and reads SKILL.md from installed plugin
 * - loadHooks(eventName) collects hooks from all installed plugins
 * - loadDroid(droidName) finds and reads droid .md from plugin
 * - Missing skill returns null, not crash
 * - Plugin skills available to persona-injector via search paths
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
 * Create a minimal plugin directory inside a scope directory.
 *
 * @param {string} scopeDir   - The scope root directory
 * @param {string} pluginName - Plugin subdirectory name
 * @param {object} opts
 * @param {string[]} [opts.skills]   - Skill names to create (as name/SKILL.md)
 * @param {string[]} [opts.skillMds] - Skill names to create as flat .md files
 * @param {string[]} [opts.hooks]    - Hook event names to create (.cjs files)
 * @param {string[]} [opts.droids]   - Droid names to create (.md files)
 * @param {object}  [opts.skillContents] - Map of skillName -> content override
 * @param {object}  [opts.droidContents] - Map of droidName -> content override
 */
function createPlugin(scopeDir, pluginName, opts = {}) {
  const pluginDir = path.join(scopeDir, pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });

  // Skills as directories with SKILL.md
  if (opts.skills && opts.skills.length > 0) {
    for (const skill of opts.skills) {
      const skillDir = path.join(pluginDir, 'skills', skill);
      fs.mkdirSync(skillDir, { recursive: true });
      const content =
        (opts.skillContents && opts.skillContents[skill]) ||
        `# Skill: ${skill}\nThis is the ${skill} skill.\n`;
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8');
    }
  }

  // Skills as flat .md files
  if (opts.skillMds && opts.skillMds.length > 0) {
    const skillsDir = path.join(pluginDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const skill of opts.skillMds) {
      const content =
        (opts.skillContents && opts.skillContents[skill]) || `# Flat Skill: ${skill}\n`;
      fs.writeFileSync(path.join(skillsDir, `${skill}.md`), content, 'utf8');
    }
  }

  // Hooks as flat .cjs files
  if (opts.hooks && opts.hooks.length > 0) {
    const hooksDir = path.join(pluginDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    for (const hook of opts.hooks) {
      fs.writeFileSync(
        path.join(hooksDir, `${hook}.cjs`),
        `'use strict';\nmodule.exports = {};\n`,
        'utf8'
      );
    }
  }

  // Droids as flat .md files
  if (opts.droids && opts.droids.length > 0) {
    const droidsDir = path.join(pluginDir, 'droids');
    fs.mkdirSync(droidsDir, { recursive: true });
    for (const droid of opts.droids) {
      const content =
        (opts.droidContents && opts.droidContents[droid]) ||
        `# Droid: ${droid}\nThis is the ${droid} droid.\n`;
      fs.writeFileSync(path.join(droidsDir, `${droid}.md`), content, 'utf8');
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginLoader', () => {
  let tmpDir;
  let projectDir;
  let userDir;
  let orgDir;
  let resolver;
  let loader;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
    projectDir = path.join(tmpDir, 'project');
    userDir = path.join(tmpDir, 'user');
    orgDir = path.join(tmpDir, 'org');

    // Project scope: plugin-alpha with 'project-skill', shared-skill, hook 'PreToolUse', droid 'nav-droid'
    createPlugin(projectDir, 'plugin-alpha', {
      skills: ['project-skill', 'shared-skill'],
      skillContents: {
        'project-skill': '# Project Skill\nProject-level implementation.\n',
        'shared-skill': '# Shared Skill (project wins)\n',
      },
      hooks: ['PreToolUse'],
      droids: ['nav-droid'],
      droidContents: {
        'nav-droid': '# Nav Droid\nNavigates the codebase.\n',
      },
    });

    // User scope: plugin-beta with 'user-skill', shared-skill (overridden by project),
    //             hooks 'PreToolUse' (additive), 'PostToolUse'
    createPlugin(userDir, 'plugin-beta', {
      skills: ['user-skill', 'shared-skill'],
      hooks: ['PreToolUse', 'PostToolUse'],
      droids: ['user-droid'],
    });

    // Org scope: plugin-gamma with 'org-skill', hook 'PostToolUse' (additive), droid 'org-droid'
    createPlugin(orgDir, 'plugin-gamma', {
      skills: ['org-skill'],
      skillMds: ['flat-skill'],
      hooks: ['PostToolUse'],
      droids: ['org-droid'],
    });

    resolver = new PluginResolver({ projectDir, userDir, orgDir });
    loader = new PluginLoader(resolver);
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows — ignore
    }
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('constructs without error given a resolver', () => {
      assert.doesNotThrow(() => new PluginLoader(resolver));
    });

    it('exposes the resolver as this.resolver', () => {
      const l = new PluginLoader(resolver);
      assert.strictEqual(l.resolver, resolver);
    });
  });

  // -------------------------------------------------------------------------
  // loadSkill(skillName)
  // -------------------------------------------------------------------------
  describe('loadSkill()', () => {
    it('returns null for a skill that does not exist in any scope', () => {
      const result = loader.loadSkill('nonexistent-skill');
      assert.equal(result, null, 'should return null for missing skill');
    });

    it('returns null rather than throwing for a missing skill (no crash)', () => {
      assert.doesNotThrow(() => loader.loadSkill('ghost-skill'));
      const result = loader.loadSkill('ghost-skill');
      assert.equal(result, null);
    });

    it('returns an object with content for a found skill (VAL-PM-006)', () => {
      const result = loader.loadSkill('project-skill');
      assert.ok(result !== null, 'should find project-skill');
      assert.ok(typeof result.content === 'string', 'result must have content string');
      assert.ok(result.content.length > 0, 'content must not be empty');
    });

    it('content matches the SKILL.md file contents', () => {
      const result = loader.loadSkill('project-skill');
      assert.ok(result !== null);
      assert.ok(
        result.content.includes('Project-level implementation'),
        'content should match SKILL.md'
      );
    });

    it('result includes path, scope, and plugin metadata', () => {
      const result = loader.loadSkill('project-skill');
      assert.ok(result !== null);
      assert.ok(typeof result.path === 'string', 'result must have path');
      assert.ok(typeof result.scope === 'string', 'result must have scope');
      assert.ok(typeof result.plugin === 'string', 'result must have plugin');
    });

    it('project scope wins for shared-skill (VAL-PM-003 scope priority)', () => {
      const result = loader.loadSkill('shared-skill');
      assert.ok(result !== null, 'should find shared-skill');
      assert.equal(result.scope, 'project', 'project scope must win');
    });

    it('finds user-skill from user scope', () => {
      const result = loader.loadSkill('user-skill');
      assert.ok(result !== null, 'should find user-skill');
      assert.equal(result.scope, 'user');
    });

    it('finds org-skill from org scope', () => {
      const result = loader.loadSkill('org-skill');
      assert.ok(result !== null, 'should find org-skill');
      assert.equal(result.scope, 'org');
    });

    it('finds flat skill (.md file) from org scope', () => {
      const result = loader.loadSkill('flat-skill');
      assert.ok(result !== null, 'should find flat-skill');
      assert.ok(result.content.includes('Flat Skill'), 'content should match flat .md');
    });

    it('path in result points to a file that actually exists', () => {
      const result = loader.loadSkill('project-skill');
      assert.ok(result !== null);
      assert.ok(fs.existsSync(result.path), 'path should point to an existing file');
    });

    it('returns null when resolver has no scopes configured', () => {
      const emptyLoader = new PluginLoader(new PluginResolver({}));
      const result = emptyLoader.loadSkill('any-skill');
      assert.equal(result, null);
    });
  });

  // -------------------------------------------------------------------------
  // loadHooks(eventName)
  // -------------------------------------------------------------------------
  describe('loadHooks()', () => {
    it('returns an array (VAL-PM-006)', () => {
      const result = loader.loadHooks('PreToolUse');
      assert.ok(Array.isArray(result), 'should return an array');
    });

    it('returns an empty array for an event with no hooks', () => {
      const result = loader.loadHooks('NonExistentEvent');
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('collects PreToolUse hooks from project and user scopes (additive)', () => {
      const result = loader.loadHooks('PreToolUse');
      assert.ok(result.length >= 2, 'should find PreToolUse hooks from at least 2 plugins');
    });

    it('each hook entry has path, scope, plugin fields', () => {
      const result = loader.loadHooks('PreToolUse');
      for (const hook of result) {
        assert.ok(typeof hook.path === 'string', 'hook must have path');
        assert.ok(typeof hook.scope === 'string', 'hook must have scope');
        assert.ok(typeof hook.plugin === 'string', 'hook must have plugin');
      }
    });

    it('hook paths exist on disk', () => {
      const result = loader.loadHooks('PreToolUse');
      for (const hook of result) {
        assert.ok(fs.existsSync(hook.path), `hook path should exist: ${hook.path}`);
      }
    });

    it('PostToolUse hooks collected from user and org scopes (additive)', () => {
      const result = loader.loadHooks('PostToolUse');
      assert.ok(result.length >= 2, 'PostToolUse should be in user and org scopes');
      const scopes = result.map(h => h.scope);
      assert.ok(scopes.includes('user'), 'user scope should be present');
      assert.ok(scopes.includes('org'), 'org scope should be present');
    });

    it('returns empty array when resolver has no scopes', () => {
      const emptyLoader = new PluginLoader(new PluginResolver({}));
      const result = emptyLoader.loadHooks('PreToolUse');
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // loadDroid(droidName)
  // -------------------------------------------------------------------------
  describe('loadDroid()', () => {
    it('returns null for a droid that does not exist in any scope', () => {
      const result = loader.loadDroid('nonexistent-droid');
      assert.equal(result, null, 'should return null for missing droid');
    });

    it('returns null rather than throwing for a missing droid (no crash)', () => {
      assert.doesNotThrow(() => loader.loadDroid('ghost-droid'));
      const result = loader.loadDroid('ghost-droid');
      assert.equal(result, null);
    });

    it('returns an object with content for a found droid (VAL-PM-006)', () => {
      const result = loader.loadDroid('nav-droid');
      assert.ok(result !== null, 'should find nav-droid');
      assert.ok(typeof result.content === 'string', 'result must have content string');
      assert.ok(result.content.length > 0, 'content must not be empty');
    });

    it('content matches the droid .md file contents', () => {
      const result = loader.loadDroid('nav-droid');
      assert.ok(result !== null);
      assert.ok(
        result.content.includes('Navigates the codebase'),
        'content should match droid .md'
      );
    });

    it('result includes path metadata', () => {
      const result = loader.loadDroid('nav-droid');
      assert.ok(result !== null);
      assert.ok(typeof result.path === 'string', 'result must have path');
    });

    it('path in result points to a file that actually exists', () => {
      const result = loader.loadDroid('nav-droid');
      assert.ok(result !== null);
      assert.ok(fs.existsSync(result.path), 'path should point to an existing file');
    });

    it('finds user-droid from user scope', () => {
      const result = loader.loadDroid('user-droid');
      assert.ok(result !== null, 'should find user-droid');
    });

    it('finds org-droid from org scope', () => {
      const result = loader.loadDroid('org-droid');
      assert.ok(result !== null, 'should find org-droid');
    });

    it('returns null when resolver has no scopes configured', () => {
      const emptyLoader = new PluginLoader(new PluginResolver({}));
      const result = emptyLoader.loadDroid('any-droid');
      assert.equal(result, null);
    });
  });

  // -------------------------------------------------------------------------
  // getSkillSearchPaths() — persona-injector integration (VAL-PM-006, VAL-CROSS-002)
  // -------------------------------------------------------------------------
  describe('getSkillSearchPaths()', () => {
    it('returns an array of directory paths', () => {
      const paths = loader.getSkillSearchPaths();
      assert.ok(Array.isArray(paths), 'should return an array');
    });

    it('returns at least one path when scopes have plugins with skills', () => {
      const paths = loader.getSkillSearchPaths();
      assert.ok(paths.length > 0, 'should return at least one path');
    });

    it('all returned paths are strings', () => {
      const paths = loader.getSkillSearchPaths();
      for (const p of paths) {
        assert.ok(typeof p === 'string', `path must be a string: ${p}`);
      }
    });

    it('all returned paths that exist are directories', () => {
      const paths = loader.getSkillSearchPaths();
      for (const p of paths) {
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          assert.ok(stat.isDirectory(), `path must be a directory: ${p}`);
        }
      }
    });

    it('persona-injector can find project-skill using returned paths (VAL-CROSS-002)', () => {
      const paths = loader.getSkillSearchPaths();
      // The persona-injector looks for skillName/SKILL.md under each search path
      let found = false;
      for (const searchPath of paths) {
        const candidate = path.join(searchPath, 'project-skill', 'SKILL.md');
        if (fs.existsSync(candidate)) {
          found = true;
          break;
        }
      }
      assert.ok(found, 'project-skill/SKILL.md should be findable via search paths');
    });

    it('returns empty array when resolver has no scopes configured', () => {
      const emptyLoader = new PluginLoader(new PluginResolver({}));
      const paths = emptyLoader.getSkillSearchPaths();
      assert.ok(Array.isArray(paths));
      assert.equal(paths.length, 0);
    });

    it('does not include duplicate paths', () => {
      const paths = loader.getSkillSearchPaths();
      const unique = [...new Set(paths)];
      assert.equal(paths.length, unique.length, 'paths must not contain duplicates');
    });
  });
});
