// .claude/lib/memory/cross-repo-registry.cjs
// Registry of known projects for cross-repo knowledge federation.
// Tracks projects in ~/.claude/knowledge/registry.json.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exportKnowledge, getProjectHash } = require('./knowledge-exporter.cjs');

const REGISTRY_FILE = 'registry.json';

/**
 * Registry of known projects for cross-repo knowledge federation.
 *
 * Stores project metadata in `knowledgeDir/registry.json`.
 * All writes are atomic (write .tmp then rename) to prevent corruption.
 * The registry file is auto-created if it does not exist.
 */
class CrossRepoRegistry {
  /**
   * @param {string} [knowledgeDir] - Directory for storing registry and project exports.
   *   Defaults to `~/.claude/knowledge`.
   */
  constructor(knowledgeDir) {
    this.knowledgeDir = knowledgeDir || path.join(os.homedir(), '.claude', 'knowledge');
    this._registryPath = path.join(this.knowledgeDir, REGISTRY_FILE);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load registry from disk.
   * Returns `{ projects: [] }` when the file is missing or corrupt.
   * @returns {{ projects: Array<{name: string, projectDir: string, registeredAt: string, lastRefreshed: string|null}> }}
   */
  _loadRegistry() {
    if (!fs.existsSync(this._registryPath)) {
      return { projects: [] };
    }
    try {
      const raw = fs.readFileSync(this._registryPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects)) {
        return parsed;
      }
      return { projects: [] };
    } catch (_err) {
      return { projects: [] };
    }
  }

  /**
   * Save registry to disk using an atomic write (temp → rename).
   * Creates the knowledge directory if it does not exist.
   * @param {{ projects: Array }} registry
   */
  _saveRegistry(registry) {
    fs.mkdirSync(this.knowledgeDir, { recursive: true });
    const tmpPath = this._registryPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), 'utf8');
    fs.renameSync(tmpPath, this._registryPath);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register a project in the registry.
   *
   * If a project with the same name already exists its `projectDir` and
   * `registeredAt` are updated while `lastRefreshed` is preserved.
   *
   * @param {string} name - Unique name for the project.
   * @param {string} projectDir - Absolute path to the project root.
   */
  registerProject(name, projectDir) {
    const registry = this._loadRegistry();
    const idx = registry.projects.findIndex(p => p.name === name);
    const now = new Date().toISOString();

    if (idx >= 0) {
      // Update existing entry, preserve lastRefreshed.
      registry.projects[idx] = {
        ...registry.projects[idx],
        name,
        projectDir,
        registeredAt: now,
      };
    } else {
      registry.projects.push({
        name,
        projectDir,
        registeredAt: now,
        lastRefreshed: null,
      });
    }

    this._saveRegistry(registry);
  }

  /**
   * List all registered projects.
   *
   * @returns {Array<{name: string, projectDir: string, registeredAt: string, lastRefreshed: string|null}>}
   */
  listProjects() {
    return this._loadRegistry().projects;
  }

  /**
   * Get the knowledge export for a named project.
   *
   * Reads `knowledgeDir/<project-hash>/export.json` and returns the parsed
   * content.  Returns `null` if the project is not registered or if the
   * export file does not exist / cannot be parsed.
   *
   * @param {string} name - Registered project name.
   * @returns {object|null}
   */
  getProjectKnowledge(name) {
    const registry = this._loadRegistry();
    const project = registry.projects.find(p => p.name === name);
    if (!project) return null;

    const hash = getProjectHash(project.projectDir);
    const exportPath = path.join(this.knowledgeDir, hash, 'export.json');

    if (!fs.existsSync(exportPath)) return null;

    try {
      const raw = fs.readFileSync(exportPath, 'utf8');
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Refresh the knowledge export for a registered project.
   *
   * Calls `exportKnowledge(projectDir)`, writes the result to
   * `knowledgeDir/<project-hash>/export.json` (atomic write), then updates
   * `lastRefreshed` in the registry.
   *
   * @param {string} name - Registered project name.
   * @returns {Promise<void>}
   * @throws {Error} When the project is not registered.
   */
  async refreshProject(name) {
    const registry = this._loadRegistry();
    const idx = registry.projects.findIndex(p => p.name === name);

    if (idx < 0) {
      throw new Error(`Project "${name}" is not registered`);
    }

    const { projectDir } = registry.projects[idx];

    // Run the knowledge export.
    const exportData = await exportKnowledge(projectDir);

    // Write exported data to the project's hash directory (atomic write).
    const hash = getProjectHash(projectDir);
    const exportDir = path.join(this.knowledgeDir, hash);
    const exportPath = path.join(exportDir, 'export.json');

    fs.mkdirSync(exportDir, { recursive: true });
    const tmpPath = exportPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(exportData, null, 2), 'utf8');
    fs.renameSync(tmpPath, exportPath);

    // Update lastRefreshed in the registry.
    registry.projects[idx] = {
      ...registry.projects[idx],
      lastRefreshed: new Date().toISOString(),
    };
    this._saveRegistry(registry);
  }

  /**
   * Remove a project from the registry.
   *
   * This is a no-op if the project is not registered.
   * The project's exported knowledge files are NOT deleted.
   *
   * @param {string} name - Registered project name.
   */
  unregisterProject(name) {
    const registry = this._loadRegistry();
    registry.projects = registry.projects.filter(p => p.name !== name);
    this._saveRegistry(registry);
  }
}

module.exports = { CrossRepoRegistry };
