'use strict';

/**
 * Plugin Loader
 *
 * Runtime loading of plugin skills, hooks, and agents.
 * Wraps a PluginResolver to provide content-reading on top of path resolution.
 *
 * Integration with persona-injector:
 *   Pass the result of getSkillSearchPaths() as the skillSearchPaths option when
 *   calling composePersona(). The injector looks for skillName/SKILL.md within
 *   each search path, which maps directly to the plugin skills directory layout.
 *
 * @example
 * const { PluginResolver } = require('.claude/lib/plugins/resolver.cjs');
 * const { PluginLoader }   = require('.claude/lib/plugins/loader.cjs');
 * const { composePersona } = require('.claude/lib/mission/persona-injector.cjs');
 *
 * const resolver = new PluginResolver({ projectDir, userDir, orgDir });
 * const loader   = new PluginLoader(resolver);
 *
 * // Load skill content
 * const skill = loader.loadSkill('my-skill');
 * // => { content: '# My Skill\n...', path: '...', scope: 'project', plugin: 'plugin-foo' } | null
 *
 * // Load all hooks for an event (additive across scopes)
 * const hooks = loader.loadHooks('PreToolUse');
 * // => [{ path: '...', scope: 'project', plugin: 'plugin-foo' }, ...]
 *
 * // Load agent content
 * const agent = loader.loadAgent('my-agent');
 * // => { content: '# My Agent\n...', path: '...' } | null
 *
 * // Integrate with persona-injector
 * const persona = composePersona({
 *   skillName: 'my-skill',
 *   skillSearchPaths: loader.getSkillSearchPaths(),
 *   missionPath: '/path/to/mission.md',
 *   feature: { id: 'my-feature' },
 * });
 */

const fs = require('node:fs');
const path = require('node:path');

class PluginLoader {
  /**
   * @param {import('./resolver.cjs').PluginResolver} resolver - Resolver instance to delegate to
   */
  constructor(resolver) {
    this.resolver = resolver;
  }

  // ---------------------------------------------------------------------------
  // loadSkill
  // ---------------------------------------------------------------------------

  /**
   * Resolve a skill by name and read its SKILL.md content.
   *
   * Resolution follows the 3-scope priority defined by the resolver:
   * project → user → org. The first matching skill wins.
   *
   * Returns null (never throws) if:
   * - No skill with that name is found in any scope
   * - The resolved path cannot be read
   *
   * @param {string} skillName - Skill name to load
   * @returns {{ content: string, path: string, scope: string, plugin: string } | null}
   */
  loadSkill(skillName) {
    const resolved = this.resolver.resolveSkill(skillName);
    if (!resolved) return null;

    let content;
    try {
      content = fs.readFileSync(resolved.path, 'utf8');
    } catch (_err) {
      return null;
    }

    return {
      content,
      path: resolved.path,
      scope: resolved.scope,
      plugin: resolved.plugin,
    };
  }

  // ---------------------------------------------------------------------------
  // loadHooks
  // ---------------------------------------------------------------------------

  /**
   * Collect all hook entries for a given event name across ALL installed plugins
   * and ALL scopes (additive — not exclusive like skills).
   *
   * Delegates directly to the resolver's additive hook resolution. Each entry
   * is a reference to a .cjs hook handler file inside a plugin's hooks/ directory.
   *
   * @param {string} eventName - Hook event name (e.g. 'PreToolUse', 'PostToolUse')
   * @returns {Array<{ path: string, scope: string, plugin: string }>}
   */
  loadHooks(eventName) {
    return this.resolver.resolveHook(eventName);
  }

  // ---------------------------------------------------------------------------
  // loadDroid
  // ---------------------------------------------------------------------------

  /**
   * Resolve an agent by name and read its .md content.
   *
   * Resolution follows the 3-scope priority defined by the resolver:
   * project → user → org. The first matching agent wins.
   *
   * Returns null (never throws) if:
   * - No agent with that name is found in any scope
   * - The resolved path cannot be read
   *
   * @param {string} agentName - Agent name to load
   * @returns {{ content: string, path: string } | null}
   */
  loadAgent(agentName) {
    const agentPath = this.resolver.resolveAgent(agentName);
    if (!agentPath) return null;

    let content;
    try {
      content = fs.readFileSync(agentPath, 'utf8');
    } catch (_err) {
      return null;
    }

    return { content, path: agentPath };
  }

  // ---------------------------------------------------------------------------
  // getSkillSearchPaths — persona-injector integration
  // ---------------------------------------------------------------------------

  /**
   * Return all plugin skills directories across all configured scopes.
   *
   * The persona-injector's composePersona() function accepts skillSearchPaths
   * and looks for `<skillName>/SKILL.md` within each entry. Passing the result
   * of this method enables the injector to find skills contributed by plugins.
   *
   * Only directories that actually exist on disk are included.
   * Paths are deduplicated before being returned.
   *
   * @returns {string[]} Array of absolute paths to plugin skills/ directories
   */
  getSkillSearchPaths() {
    const seen = new Set();
    const paths = [];

    for (const [, scopeDir] of this.resolver._scopes()) {
      const plugins = this.resolver._listPlugins(scopeDir);
      for (const pluginDir of plugins) {
        const skillsDir = path.join(pluginDir, 'skills');
        if (!seen.has(skillsDir) && fs.existsSync(skillsDir)) {
          seen.add(skillsDir);
          paths.push(skillsDir);
        }
      }
    }

    return paths;
  }
}

module.exports = { PluginLoader };
