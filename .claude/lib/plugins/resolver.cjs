'use strict';

/**
 * Plugin Resolver
 *
 * 3-scope plugin discovery and resolution.
 * Scopes are checked in priority order: project → user → org.
 *
 * For exclusive resources (skills, droids), the first match wins.
 * For additive resources (hooks), ALL matches across scopes are returned.
 *
 * Directory convention within each scope:
 *   scopeDir/
 *     <plugin-name>/          ← installed plugin directory
 *       skills/
 *         <name>/             ← skill as directory with SKILL.md
 *           SKILL.md
 *         <name>.md           ← skill as flat .md file
 *       hooks/
 *         <eventName>.cjs     ← hook as flat .cjs file
 *         <eventName>/        ← hook as directory of .cjs files
 *           *.cjs
 *       droids/
 *         <name>.md           ← droid as flat .md file
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * PluginResolver resolves skills, hooks, and droids across three plugin scopes.
 *
 * @example
 * const { PluginResolver } = require('.claude/lib/plugins/resolver.cjs');
 * const resolver = new PluginResolver({ projectDir, userDir, orgDir });
 *
 * const skill = resolver.resolveSkill('my-skill');
 * // => { path: '/.../.../SKILL.md', scope: 'project', plugin: 'plugin-foo' }
 */
class PluginResolver {
  /**
   * @param {object} options
   * @param {string} [options.projectDir] - Project-level plugin scope directory
   * @param {string} [options.userDir]    - User-level plugin scope directory
   * @param {string} [options.orgDir]     - Org-level plugin scope directory
   */
  constructor({ projectDir, userDir, orgDir } = {}) {
    this.projectDir = projectDir || null;
    this.userDir = userDir || null;
    this.orgDir = orgDir || null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns [[scopeName, scopeDir], ...] in priority order, omitting null dirs.
   * @private
   * @returns {Array<[string, string]>}
   */
  _scopes() {
    return [
      ['project', this.projectDir],
      ['user', this.userDir],
      ['org', this.orgDir],
    ].filter(([, dir]) => dir != null);
  }

  /**
   * Lists immediate plugin subdirectories within a scope directory.
   * Returns an empty array if the directory does not exist or is unreadable.
   *
   * @private
   * @param {string} scopeDir
   * @returns {string[]} Absolute paths of plugin directories
   */
  _listPlugins(scopeDir) {
    if (!scopeDir || !fs.existsSync(scopeDir)) return [];
    try {
      const entries = fs.readdirSync(scopeDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => path.join(scopeDir, e.name));
    } catch (_err) {
      return [];
    }
  }

  /**
   * Tries to find a skill file within a single plugin directory.
   * Supports two layouts:
   *   1. skills/<name>.md           — flat file
   *   2. skills/<name>/SKILL.md     — directory with SKILL.md
   *
   * @private
   * @param {string} pluginDir - Absolute path to the plugin root
   * @param {string} name      - Skill name to look up
   * @returns {string|null} Absolute path to the skill file, or null
   */
  _findSkillInPlugin(pluginDir, name) {
    const skillsDir = path.join(pluginDir, 'skills');
    if (!fs.existsSync(skillsDir)) return null;

    // 1. Flat .md file: skills/<name>.md
    const flatPath = path.join(skillsDir, `${name}.md`);
    if (fs.existsSync(flatPath)) return flatPath;

    // 2. Directory with SKILL.md: skills/<name>/SKILL.md
    const dirPath = path.join(skillsDir, name);
    if (fs.existsSync(dirPath)) {
      try {
        if (fs.statSync(dirPath).isDirectory()) {
          const skillMd = path.join(dirPath, 'SKILL.md');
          if (fs.existsSync(skillMd)) return skillMd;
        }
      } catch (_err) {
        // skip on stat error
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Resolve a skill by name, checking project → user → org scopes.
   * Returns the first match found (project wins over user, user wins over org).
   *
   * @param {string} name - Skill name to resolve
   * @returns {{ path: string, scope: string, plugin: string } | null}
   */
  resolveSkill(name) {
    for (const [scopeName, scopeDir] of this._scopes()) {
      const plugins = this._listPlugins(scopeDir);
      for (const pluginDir of plugins) {
        const skillPath = this._findSkillInPlugin(pluginDir, name);
        if (skillPath) {
          return {
            path: skillPath,
            scope: scopeName,
            plugin: path.basename(pluginDir),
          };
        }
      }
    }
    return null;
  }

  /**
   * Resolve all hooks for a given event name across ALL scopes (additive).
   * Unlike skills, hooks from every scope are collected and returned together.
   *
   * Supports two hook layouts per plugin:
   *   1. hooks/<eventName>.cjs         — single flat hook file
   *   2. hooks/<eventName>/<file>.cjs  — directory of hook files
   *
   * @param {string} eventName - Hook event name (e.g. 'PreToolUse')
   * @returns {Array<{ path: string, scope: string, plugin: string }>}
   */
  resolveHook(eventName) {
    const results = [];

    for (const [scopeName, scopeDir] of this._scopes()) {
      const plugins = this._listPlugins(scopeDir);
      for (const pluginDir of plugins) {
        const hooksDir = path.join(pluginDir, 'hooks');
        if (!fs.existsSync(hooksDir)) continue;

        // 1. Flat .cjs file: hooks/<eventName>.cjs
        const flatPath = path.join(hooksDir, `${eventName}.cjs`);
        if (fs.existsSync(flatPath)) {
          results.push({
            path: flatPath,
            scope: scopeName,
            plugin: path.basename(pluginDir),
          });
          // Do not skip — a directory with the same name could co-exist
        }

        // 2. Directory of hook files: hooks/<eventName>/<file>.cjs
        const dirPath = path.join(hooksDir, eventName);
        if (fs.existsSync(dirPath)) {
          try {
            if (fs.statSync(dirPath).isDirectory()) {
              const hookFiles = fs
                .readdirSync(dirPath)
                .filter(f => f.endsWith('.cjs'))
                .map(f => path.join(dirPath, f));
              for (const hookPath of hookFiles) {
                results.push({
                  path: hookPath,
                  scope: scopeName,
                  plugin: path.basename(pluginDir),
                });
              }
            }
          } catch (_err) {
            // skip on error
          }
        }
      }
    }

    return results;
  }

  /**
   * Resolve a droid by name, checking project → user → org scopes.
   * Returns the path to the first matching droid file found.
   *
   * Supports: droids/<name>.md
   *
   * @param {string} name - Droid name to resolve
   * @returns {string | null} Absolute path to the droid file, or null
   */
  resolveDroid(name) {
    for (const [, scopeDir] of this._scopes()) {
      const plugins = this._listPlugins(scopeDir);
      for (const pluginDir of plugins) {
        const droidsDir = path.join(pluginDir, 'droids');
        if (!fs.existsSync(droidsDir)) continue;

        const mdPath = path.join(droidsDir, `${name}.md`);
        if (fs.existsSync(mdPath)) return mdPath;
      }
    }
    return null;
  }

  /**
   * List all skills across all scopes with scope annotations.
   * Skills are de-duplicated by name — highest-priority scope wins
   * (project overrides user, user overrides org).
   *
   * @returns {Array<{ name: string, path: string, scope: string, plugin: string }>}
   */
  listAllSkills() {
    const seen = new Set();
    const skills = [];

    for (const [scopeName, scopeDir] of this._scopes()) {
      const plugins = this._listPlugins(scopeDir);
      for (const pluginDir of plugins) {
        const skillsDir = path.join(pluginDir, 'skills');
        if (!fs.existsSync(skillsDir)) continue;

        let entries;
        try {
          entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        } catch (_err) {
          continue;
        }

        for (const entry of entries) {
          let skillName = null;
          let skillPath = null;

          if (entry.isFile() && entry.name.endsWith('.md')) {
            // Flat file: skills/<name>.md
            skillName = entry.name.slice(0, -3);
            skillPath = path.join(skillsDir, entry.name);
          } else if (entry.isDirectory()) {
            // Directory with SKILL.md: skills/<name>/SKILL.md
            const candidateMd = path.join(skillsDir, entry.name, 'SKILL.md');
            if (fs.existsSync(candidateMd)) {
              skillName = entry.name;
              skillPath = candidateMd;
            }
          }

          if (skillName !== null && skillPath !== null && !seen.has(skillName)) {
            seen.add(skillName);
            skills.push({
              name: skillName,
              path: skillPath,
              scope: scopeName,
              plugin: path.basename(pluginDir),
            });
          }
        }
      }
    }

    return skills;
  }
}

module.exports = { PluginResolver };
