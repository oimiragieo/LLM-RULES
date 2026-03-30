// .claude/lib/memory/federated-query.cjs
// Federated query across multiple project knowledge bases.

'use strict';

/**
 * FederatedQuery — query across multiple project knowledge exports.
 *
 * Searches entity exports across all/selected registered projects,
 * finds cross-repo relationships, and identifies shared patterns.
 *
 * @class FederatedQuery
 */
class FederatedQuery {
  /**
   * @param {import('./cross-repo-registry.cjs').CrossRepoRegistry} registry
   *   CrossRepoRegistry instance to source project knowledge from.
   */
  constructor(registry) {
    this.registry = registry;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load knowledge exports for all (or selected) registered projects.
   *
   * Projects without an available export.json are silently skipped.
   *
   * @param {string[]|undefined} projects - Restrict to these project names.
   *   When undefined/null all registered projects are included.
   * @returns {Array<{projectName: string, knowledge: object}>}
   * @private
   */
  _loadExports(projects) {
    if (!this.registry) return [];

    const allProjects = this.registry.listProjects();
    if (!allProjects || allProjects.length === 0) return [];

    const selected =
      projects && projects.length > 0
        ? allProjects.filter(p => projects.includes(p.name))
        : allProjects;

    const result = [];
    for (const project of selected) {
      const knowledge = this.registry.getProjectKnowledge(project.name);
      if (knowledge) {
        result.push({ projectName: project.name, knowledge });
      }
    }
    return result;
  }

  /**
   * Calculate a match score for an entity against a lowercase query string.
   *
   * Scoring priorities (highest wins):
   *  1.0 — exact name match
   *  0.8 — name contains query as substring
   *  0.6 — type contains query as substring
   *  0.4 — content or description contains query as substring
   *
   * Returns 0 when the entity does not match at all.
   *
   * @param {object} entity - Entity object from an export.
   * @param {string} queryLower - Already-lowercased query string.
   * @returns {number} Score in [0, 1].
   * @private
   */
  _scoreEntity(entity, queryLower) {
    const nameLower = (entity.name || '').toLowerCase();
    const typeLower = (entity.type || '').toLowerCase();
    const contentLower = (entity.content || '').toLowerCase();
    const descriptionLower = (entity.description || '').toLowerCase();

    if (nameLower.includes(queryLower)) {
      return nameLower === queryLower ? 1.0 : 0.8;
    }
    if (typeLower.includes(queryLower)) {
      return 0.6;
    }
    if (descriptionLower.includes(queryLower) || contentLower.includes(queryLower)) {
      return 0.4;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Search entities across all (or selected) registered projects.
   *
   * Performs case-insensitive substring matching against each entity's
   * name, type, content, and description fields.  Results are annotated
   * with the source project and a numeric score and returned sorted by
   * score descending.
   *
   * @param {string} query - Search string (case-insensitive substring).
   * @param {object} [opts={}] - Options.
   * @param {string[]} [opts.projects] - Limit search to these project names.
   * @returns {Array<{entity: object, project: string, score: number}>}
   */
  searchEntities(query, opts = {}) {
    if (!query) return [];

    const { projects } = opts;
    const exports = this._loadExports(projects);
    const queryLower = query.toLowerCase();
    const results = [];

    for (const { projectName, knowledge } of exports) {
      const entities = knowledge.entities || [];
      for (const entity of entities) {
        const score = this._scoreEntity(entity, queryLower);
        if (score > 0) {
          results.push({ entity, project: projectName, score });
        }
      }
    }

    // Sort by score descending.
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Find entities in OTHER projects that share the same name or type as a
   * given entity in the source project.
   *
   * Name comparison is case-insensitive. The source project itself is
   * excluded from the results.
   *
   * Scoring:
   *  1.0 — same name AND same type
   *  0.8 — same name only
   *  0.6 — same type only
   *
   * @param {string} entityId - ID of the entity within the source project.
   * @param {string} sourceProject - Name of the project that owns the entity.
   * @returns {Array<{entity: object, project: string, score: number}>}
   */
  findRelatedAcrossRepos(entityId, sourceProject) {
    if (!entityId || !sourceProject) return [];

    // Load source project knowledge.
    const sourceExports = this._loadExports([sourceProject]);
    if (!sourceExports.length) return [];

    const sourceKnowledge = sourceExports[0].knowledge;
    const sourceEntity = (sourceKnowledge.entities || []).find(e => e.id === entityId);
    if (!sourceEntity) return [];

    const sourceNameLower = (sourceEntity.name || '').toLowerCase();
    const sourceType = sourceEntity.type;

    // Load all other projects.
    const allExports = this._loadExports(undefined);
    const otherExports = allExports.filter(e => e.projectName !== sourceProject);

    const results = [];

    for (const { projectName, knowledge } of otherExports) {
      const entities = knowledge.entities || [];
      for (const entity of entities) {
        const nameLower = (entity.name || '').toLowerCase();
        const sharedName = nameLower === sourceNameLower;
        const sharedType = entity.type === sourceType;

        if (sharedName || sharedType) {
          let score;
          if (sharedName && sharedType) {
            score = 1.0;
          } else if (sharedName) {
            score = 0.8;
          } else {
            score = 0.6;
          }
          results.push({ entity, project: projectName, score });
        }
      }
    }

    // Sort by score descending.
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Identify entity names and types that appear across 2 or more registered
   * projects.
   *
   * Name matching is case-insensitive: "AuthService" and "authservice" are
   * treated as the same pattern.
   *
   * @returns {Array<{name: string, type: string, projects: string[], count: number}>}
   */
  getSharedPatterns() {
    const allExports = this._loadExports(undefined);
    if (!allExports.length) return [];

    // Key: "<name_lower>::<type>", value: pattern accumulator.
    const patternMap = new Map();

    for (const { projectName, knowledge } of allExports) {
      const entities = knowledge.entities || [];
      // Track (name, type) pairs we have already counted for this project to
      // avoid inflating counts when a project has duplicate entities.
      const seenInProject = new Set();

      for (const entity of entities) {
        const key = `${(entity.name || '').toLowerCase()}::${entity.type || ''}`;

        if (seenInProject.has(key)) continue;
        seenInProject.add(key);

        if (!patternMap.has(key)) {
          patternMap.set(key, {
            name: entity.name,
            type: entity.type,
            projects: [],
            count: 0,
          });
        }

        const pattern = patternMap.get(key);
        if (!pattern.projects.includes(projectName)) {
          pattern.projects.push(projectName);
          pattern.count = pattern.projects.length;
        }
      }
    }

    // Return only patterns that appear in 2 or more projects.
    return Array.from(patternMap.values()).filter(p => p.count >= 2);
  }
}

module.exports = { FederatedQuery };
