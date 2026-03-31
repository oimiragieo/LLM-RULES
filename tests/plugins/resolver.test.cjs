'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { PluginResolver } = require('../../.claude/lib/plugins/resolver.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal plugin directory inside a scope directory.
 *
 * @param {string} scopeDir   - The scope root directory (e.g. tmpDir/project)
 * @param {string} pluginName - Plugin subdirectory name (e.g. "plugin-foo")
 * @param {object} opts
 * @param {string[]} [opts.skills]   - Skill names to create (as name/SKILL.md)
 * @param {string[]} [opts.skillMds] - Skill names to create as flat .md files
 * @param {string[]} [opts.hooks]    - Hook event names to create (.cjs files)
 * @param {string[]} [opts.agents]   - Agent names to create (.md files)
 */
function createPlugin(scopeDir, pluginName, opts = {}) {
  const pluginDir = path.join(scopeDir, pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });

  // Skills as directories with SKILL.md
  if (opts.skills && opts.skills.length > 0) {
    for (const skill of opts.skills) {
      const skillDir = path.join(pluginDir, 'skills', skill);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skill}\n`, 'utf8');
    }
  }

  // Skills as flat .md files
  if (opts.skillMds && opts.skillMds.length > 0) {
    const skillsDir = path.join(pluginDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const skill of opts.skillMds) {
      fs.writeFileSync(path.join(skillsDir, `${skill}.md`), `# ${skill}\n`, 'utf8');
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

  // Agents as flat .md files
  if (opts.agents && opts.agents.length > 0) {
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    for (const agent of opts.agents) {
      fs.writeFileSync(path.join(agentsDir, `${agent}.md`), `# ${agent}\n`, 'utf8');
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginResolver', () => {
  let tmpDir;
  let projectDir;
  let userDir;
  let orgDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-resolver-test-'));
    projectDir = path.join(tmpDir, 'project');
    userDir = path.join(tmpDir, 'user');
    orgDir = path.join(tmpDir, 'org');

    // Project scope: plugin-foo with 'shared-skill', 'project-only-skill', hook 'PreToolUse'
    createPlugin(projectDir, 'plugin-foo', {
      skills: ['shared-skill', 'project-only-skill'],
      hooks: ['PreToolUse'],
      agents: ['shared-agent', 'project-agent'],
    });

    // User scope: plugin-bar with 'shared-skill' (overridden by project), 'user-skill',
    //             hook 'PreToolUse' (additive), 'PostToolUse'
    createPlugin(userDir, 'plugin-bar', {
      skills: ['shared-skill', 'user-skill'],
      hooks: ['PreToolUse', 'PostToolUse'],
      agents: ['shared-agent', 'user-agent'],
    });

    // Org scope: plugin-baz with 'shared-skill' (overridden), 'org-skill', 'user-skill' (user wins),
    //            hook 'PostToolUse' (additive)
    createPlugin(orgDir, 'plugin-baz', {
      skills: ['shared-skill', 'org-skill', 'user-skill'],
      skillMds: ['org-flat-skill'],
      hooks: ['PostToolUse'],
      agents: ['shared-agent', 'org-agent'],
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // EBUSY on Windows — ignore
    }
  });

  // -------------------------------------------------------------------------
  // Constructor / missing scopes
  // -------------------------------------------------------------------------
  describe('constructor and missing scopes', () => {
    it('constructs without error when all scopes are provided', () => {
      assert.doesNotThrow(() => new PluginResolver({ projectDir, userDir, orgDir }));
    });

    it('constructs without error when no scopes are provided', () => {
      assert.doesNotThrow(() => new PluginResolver({}));
    });

    it('constructs without error when some scopes are undefined', () => {
      assert.doesNotThrow(() => new PluginResolver({ projectDir }));
    });

    it('handles missing scope directories gracefully — resolveSkill returns null', () => {
      const r = new PluginResolver({ projectDir: '/nonexistent/path' });
      const result = r.resolveSkill('any-skill');
      assert.equal(result, null, 'should return null when scope dir does not exist');
    });

    it('handles missing scope directories gracefully — resolveHook returns empty array', () => {
      const r = new PluginResolver({ projectDir: '/nonexistent/path' });
      const result = r.resolveHook('AnyEvent');
      assert.ok(Array.isArray(result), 'should return an array');
      assert.equal(result.length, 0, 'should return empty array for missing scope');
    });

    it('handles missing scope directories gracefully — listAllSkills returns empty array', () => {
      const r = new PluginResolver({ projectDir: '/nonexistent/path' });
      const result = r.listAllSkills();
      assert.ok(Array.isArray(result), 'should return an array');
      assert.equal(result.length, 0, 'should return empty array for missing scope');
    });
  });

  // -------------------------------------------------------------------------
  // resolveSkill — scope priority (VAL-PM-003)
  // -------------------------------------------------------------------------
  describe('resolveSkill()', () => {
    it('returns null when skill is not found in any scope', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('nonexistent-skill');
      assert.equal(result, null);
    });

    it('returns { path, scope, plugin } for a found skill (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('project-only-skill');
      assert.ok(result !== null, 'should find project-only-skill');
      assert.ok(typeof result.path === 'string', 'path must be a string');
      assert.ok(typeof result.scope === 'string', 'scope must be a string');
      assert.ok(typeof result.plugin === 'string', 'plugin must be a string');
    });

    it('project scope skill overrides user scope same-name skill (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('shared-skill');
      assert.ok(result !== null, 'should find shared-skill');
      assert.equal(result.scope, 'project', 'project scope must win');
      assert.equal(result.plugin, 'plugin-foo', 'plugin-foo in project must be returned');
    });

    it('user scope skill overrides org scope same-name skill (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      // user-skill exists in user and org scopes but NOT project
      const result = r.resolveSkill('user-skill');
      assert.ok(result !== null, 'should find user-skill');
      assert.equal(result.scope, 'user', 'user scope must win over org');
      assert.equal(result.plugin, 'plugin-bar');
    });

    it('falls back to org scope when skill is only in org (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('org-skill');
      assert.ok(result !== null, 'should find org-skill');
      assert.equal(result.scope, 'org', 'org scope should be returned');
      assert.equal(result.plugin, 'plugin-baz');
    });

    it('resolves skill as flat .md file in org scope', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('org-flat-skill');
      assert.ok(result !== null, 'should find org-flat-skill');
      assert.equal(result.scope, 'org');
      assert.ok(result.path.endsWith('.md'), 'path must end with .md');
    });

    it('path points to a file that actually exists', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveSkill('project-only-skill');
      assert.ok(result !== null);
      assert.ok(fs.existsSync(result.path), 'resolved path must exist on disk');
    });

    it('works with only project scope provided', () => {
      const r = new PluginResolver({ projectDir });
      const result = r.resolveSkill('project-only-skill');
      assert.ok(result !== null);
      assert.equal(result.scope, 'project');
    });

    it('works with only user scope provided', () => {
      const r = new PluginResolver({ userDir });
      const result = r.resolveSkill('user-skill');
      assert.ok(result !== null);
      assert.equal(result.scope, 'user');
    });
  });

  // -------------------------------------------------------------------------
  // resolveHook — additive across scopes
  // -------------------------------------------------------------------------
  describe('resolveHook()', () => {
    it('returns an empty array when no hooks match', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('NonExistentEvent');
      assert.ok(Array.isArray(result), 'result must be array');
      assert.equal(result.length, 0);
    });

    it('returns hooks from ALL scopes — additive not exclusive', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      // PreToolUse is in project (plugin-foo) AND user (plugin-bar)
      const result = r.resolveHook('PreToolUse');
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 2, 'must return hooks from at least 2 scopes');
    });

    it('each hook result has { path, scope, plugin }', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('PreToolUse');
      for (const hook of result) {
        assert.ok(typeof hook.path === 'string', 'path must be a string');
        assert.ok(typeof hook.scope === 'string', 'scope must be a string');
        assert.ok(typeof hook.plugin === 'string', 'plugin must be a string');
      }
    });

    it('hook paths exist on disk', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('PreToolUse');
      for (const hook of result) {
        assert.ok(fs.existsSync(hook.path), `hook path must exist: ${hook.path}`);
      }
    });

    it('hooks from project scope are included', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('PreToolUse');
      const projectHooks = result.filter(h => h.scope === 'project');
      assert.ok(projectHooks.length >= 1, 'project scope hook must be included');
    });

    it('hooks from user scope are included alongside project hooks', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('PreToolUse');
      const userHooks = result.filter(h => h.scope === 'user');
      assert.ok(userHooks.length >= 1, 'user scope hook must be included');
    });

    it('PostToolUse hook from user and org scopes both returned (additive)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveHook('PostToolUse');
      assert.ok(result.length >= 2, 'must return hooks from user AND org scopes');
      const scopes = result.map(h => h.scope);
      assert.ok(scopes.includes('user'), 'user scope must be present');
      assert.ok(scopes.includes('org'), 'org scope must be present');
    });

    it('handles missing scopes gracefully — returns only available scopes', () => {
      const r = new PluginResolver({ projectDir });
      const result = r.resolveHook('PreToolUse');
      assert.ok(Array.isArray(result));
      // Only project scope is configured
      for (const hook of result) {
        assert.equal(hook.scope, 'project');
      }
    });
  });

  // -------------------------------------------------------------------------
  // resolveAgent
  // -------------------------------------------------------------------------
  describe('resolveAgent()', () => {
    it('returns null when agent is not found in any scope', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveAgent('nonexistent-agent');
      assert.equal(result, null);
    });

    it('returns path string for a found agent', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveAgent('project-agent');
      assert.ok(typeof result === 'string', 'should return a path string');
      assert.ok(result.endsWith('.md'), 'agent path should end with .md');
    });

    it('project scope agent overrides user scope same-name agent', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveAgent('shared-agent');
      assert.ok(result !== null);
      // Must be from project scope
      assert.ok(result.includes('plugin-foo'), 'project scope must win for agents');
    });

    it('user scope agent overrides org scope agent', () => {
      const r = new PluginResolver({
        projectDir: path.join(tmpDir, 'empty-project'),
        userDir,
        orgDir,
      });
      const result = r.resolveAgent('user-agent');
      assert.ok(result !== null);
      assert.ok(result.includes('plugin-bar'), 'user scope must win over org');
    });

    it('falls back to org scope when agent is only in org', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveAgent('org-agent');
      assert.ok(result !== null);
      assert.ok(result.includes('plugin-baz'), 'org scope agent should be returned');
    });

    it('resolved agent path exists on disk', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.resolveAgent('project-agent');
      assert.ok(result !== null);
      assert.ok(fs.existsSync(result), 'resolved agent path must exist');
    });
  });

  // -------------------------------------------------------------------------
  // listAllSkills — merged without duplicates
  // -------------------------------------------------------------------------
  describe('listAllSkills()', () => {
    it('returns an array', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      assert.ok(Array.isArray(result), 'must return an array');
    });

    it('each entry has { name, path, scope, plugin } (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      for (const skill of result) {
        assert.ok(typeof skill.name === 'string', 'name must be string');
        assert.ok(typeof skill.path === 'string', 'path must be string');
        assert.ok(typeof skill.scope === 'string', 'scope must be string');
        assert.ok(typeof skill.plugin === 'string', 'plugin must be string');
      }
    });

    it('no duplicate skill names in the result (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const names = result.map(s => s.name);
      const uniqueNames = [...new Set(names)];
      assert.equal(names.length, uniqueNames.length, 'no duplicate names allowed');
    });

    it('shared-skill comes from project scope not user or org (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const sharedSkill = result.find(s => s.name === 'shared-skill');
      assert.ok(sharedSkill, 'shared-skill must be in result');
      assert.equal(sharedSkill.scope, 'project', 'project scope must win');
    });

    it('user-skill comes from user scope not org scope (VAL-PM-003)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const userSkill = result.find(s => s.name === 'user-skill');
      assert.ok(userSkill, 'user-skill must be in result');
      assert.equal(userSkill.scope, 'user', 'user scope must win over org');
    });

    it('includes skills from all scopes (project, user, org)', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const names = result.map(s => s.name);
      assert.ok(names.includes('project-only-skill'), 'project-only-skill must be present');
      assert.ok(names.includes('user-skill'), 'user-skill must be present');
      assert.ok(names.includes('org-skill'), 'org-skill must be present');
    });

    it('includes flat .md skills from org scope', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const names = result.map(s => s.name);
      assert.ok(names.includes('org-flat-skill'), 'flat .md skill must be included');
    });

    it('skill paths exist on disk', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      for (const skill of result) {
        assert.ok(fs.existsSync(skill.path), `skill path must exist: ${skill.path}`);
      }
    });

    it('returns empty array when no scopes configured', () => {
      const r = new PluginResolver({});
      const result = r.listAllSkills();
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('scope annotations are correct for project skills', () => {
      const r = new PluginResolver({ projectDir, userDir, orgDir });
      const result = r.listAllSkills();
      const projectSkills = result.filter(s => s.scope === 'project');
      assert.ok(projectSkills.length >= 2, 'should have project-scoped skills');
      for (const s of projectSkills) {
        assert.equal(s.plugin, 'plugin-foo');
      }
    });
  });
});
