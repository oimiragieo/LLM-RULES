// .claude/lib/memory/entity-query.cjs
// Entity query API with graph traversal for hybrid memory system (Task #28 - P1-2.4)

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/**
 * EntityQuery - Query entities and traverse relationship graphs
 *
 * Methods:
 * - findById(id, options) - Find entity by ID with optional relationships
 * - findByType(type, filters) - Find entities by type with filters
 * - findRelated(id, options) - Find related entities with depth traversal
 * - getRelationshipPath(fromId, toId, options) - Find shortest path between entities (BFS)
 *
 * @class EntityQuery
 */
class EntityQuery {
  /**
   * Create EntityQuery instance
   * @param {DatabaseSync|string} dbOrPath - Database instance or path to SQLite database
   */
  constructor(dbOrPath) {
    if (typeof dbOrPath === 'string') {
      // Open database from path
      const projectRoot = PROJECT_ROOT;
      let dbPath;
      if (dbOrPath === ':memory:') {
        dbPath = dbOrPath;
      } else if (path.isAbsolute(dbOrPath)) {
        // Already absolute - use as-is
        dbPath = dbOrPath;
      } else {
        // Relative path - join with project root
        dbPath = path.join(projectRoot, dbOrPath);
      }
      this.db = new DatabaseSync(dbPath);
      this.db.exec('PRAGMA foreign_keys = ON');
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.ownDb = true; // Close on cleanup
    } else {
      // Use provided database instance
      this.db = dbOrPath;
      this.ownDb = false; // Don't close (caller manages)
    }

    // Validate schema early to avoid runtime crashes like "no such table: entities".
    this.validateSchema();
  }

  /**
   * Validate required SQLite tables exist.
   *
   * @throws {Error} If schema is missing
   */
  validateSchema() {
    const requiredTables = ['entities', 'entity_relationships'];
    const placeholders = requiredTables.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`)
      .all(...requiredTables);
    const found = new Set(rows.map(r => r.name));
    const missing = requiredTables.filter(t => !found.has(t));

    if (missing.length > 0) {
      const hint =
        'Memory DB not initialized. Run `pnpm run memory:init` (or `node .claude/tools/cli/init-memory-db.cjs`).';
      throw new Error(`${hint} Missing tables: ${missing.join(', ')}`);
    }
  }

  /**
   * Find entity by ID
   *
   * @param {string} id - Entity ID
   * @param {Object} options - Query options
   * @param {boolean} options.includeRelationships - Include relationships in result
   * @returns {Promise<Object|null>} Entity with optional relationships, or null if not found
   */
  async findById(id, options = {}) {
    const { includeRelationships = false } = options;

    // Query entity
    const stmt = this.db.prepare(`
      SELECT * FROM entities WHERE id = ?
    `);
    const entity = stmt.get(id);

    if (!entity) {
      return null;
    }

    // Include relationships if requested
    if (includeRelationships) {
      entity.relationships = await this._getEntityRelationships(id);
    }

    return entity;
  }

  /**
   * Find entities by type with optional filters
   *
   * @param {string} type - Entity type (agent, task, skill, concept, file, pattern, decision, issue)
   * @param {Object} filters - Query filters
   * @param {number} filters.limit - Maximum results
   * @param {number} filters.quality_score - Minimum quality score (0-1)
   * @param {string} filters.source_file - Source file filter
   * @param {string} filters.created_after - ISO 8601 timestamp (find entities created after this date)
   * @returns {Promise<Array>} Array of entities matching criteria
   */
  async findByType(type, filters = {}) {
    const { limit, quality_score, source_file, created_after } = filters;

    // Build WHERE clause dynamically
    const conditions = ['type = ?'];
    const params = [type];

    if (quality_score !== undefined) {
      conditions.push('quality_score >= ?');
      params.push(quality_score);
    }

    if (source_file !== undefined) {
      conditions.push('source_file = ?');
      params.push(source_file);
    }

    if (created_after !== undefined) {
      conditions.push('created_at > ?');
      params.push(created_after);
    }

    // Build query
    let query = `
      SELECT * FROM entities
      WHERE ${conditions.join(' AND ')}
      ORDER BY quality_score DESC, created_at DESC
    `;

    if (limit !== undefined) {
      const limitNum = Number.isFinite(Number(limit)) ? Math.max(0, parseInt(limit, 10)) : 0;
      query += ` LIMIT ${limitNum}`;
    }

    const stmt = this.db.prepare(query);
    const entities = stmt.all(...params);

    return entities;
  }

  /**
   * Find related entities with depth traversal
   *
   * @param {string} id - Entity ID
   * @param {Object} options - Query options
   * @param {string} options.relationshipType - Filter by relationship type (e.g., 'assigned_to')
   * @param {number} options.depth - Traversal depth (default: 1)
   * @returns {Promise<Array>} Array of {entity, relationship_type, weight} objects
   */
  async findRelated(id, options = {}) {
    const { relationshipType, depth: rawDepth = 1 } = options;
    const depthNum = parseInt(rawDepth, 10);
    const depth = Number.isFinite(depthNum) && depthNum >= 1 ? depthNum : 1;

    // Build query based on whether we have a relationship type filter
    // Search BOTH outgoing (from_entity_id = id) AND incoming (to_entity_id = id)
    let query;
    let params;

    if (relationshipType) {
      // Filtered query with type filter
      query = `
        WITH RECURSIVE related AS (
          -- Base case: OUTGOING relationships (from_entity_id = id)
          SELECT
            r.to_entity_id AS entity_id,
            r.relationship_type AS rel_type,
            r.weight AS rel_weight,
            1 AS depth,
            'outgoing' AS direction
          FROM entity_relationships r
          WHERE r.from_entity_id = ?
            AND r.relationship_type = ?

          UNION

          -- Base case: INCOMING relationships (to_entity_id = id)
          SELECT
            r.from_entity_id AS entity_id,
            r.relationship_type AS rel_type,
            r.weight AS rel_weight,
            1 AS depth,
            'incoming' AS direction
          FROM entity_relationships r
          WHERE r.to_entity_id = ?
            AND r.relationship_type = ?

          UNION

          -- Recursive case: traverse from found entities
          SELECT
            r.to_entity_id,
            r.relationship_type,
            r.weight,
            related.depth + 1,
            'outgoing'
          FROM entity_relationships r
          JOIN related ON r.from_entity_id = related.entity_id
          WHERE related.depth < ${depth}
            AND r.relationship_type = ?
        )
        SELECT DISTINCT
          e.*,
          related.rel_type AS relationship_type,
          related.rel_weight AS weight
        FROM related
        JOIN entities e ON e.id = related.entity_id
        ORDER BY related.depth ASC, e.quality_score DESC
      `;
      // Bind parameters: id (outgoing), relationshipType (outgoing), id (incoming), relationshipType (incoming), relationshipType (recursive)
      params = [id, relationshipType, id, relationshipType, relationshipType];
    } else {
      // Unfiltered query
      query = `
        WITH RECURSIVE related AS (
          -- Base case: OUTGOING relationships
          SELECT
            r.to_entity_id AS entity_id,
            r.relationship_type AS rel_type,
            r.weight AS rel_weight,
            1 AS depth
          FROM entity_relationships r
          WHERE r.from_entity_id = ?

          UNION

          -- Base case: INCOMING relationships
          SELECT
            r.from_entity_id AS entity_id,
            r.relationship_type AS rel_type,
            r.weight AS rel_weight,
            1 AS depth
          FROM entity_relationships r
          WHERE r.to_entity_id = ?

          UNION

          -- Recursive case: traverse relationships
          SELECT
            r.to_entity_id,
            r.relationship_type,
            r.weight,
            related.depth + 1
          FROM entity_relationships r
          JOIN related ON r.from_entity_id = related.entity_id
          WHERE related.depth < ${depth}
        )
        SELECT DISTINCT
          e.*,
          related.rel_type AS relationship_type,
          related.rel_weight AS weight
        FROM related
        JOIN entities e ON e.id = related.entity_id
        ORDER BY related.depth ASC, e.quality_score DESC
      `;
      params = [id, id];
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    // Format results: {entity, relationship_type, weight}
    const results = rows.map(row => {
      const { relationship_type, weight, ...entityFields } = row;
      return {
        entity: entityFields,
        relationship_type,
        weight,
      };
    });

    return results;
  }

  /**
   * Find shortest relationship path between two entities using BFS
   *
   * @param {string} fromId - Starting entity ID
   * @param {string} toId - Target entity ID
   * @param {Object} options - Query options
   * @param {number} options.maxDepth - Maximum path depth (default: 5)
   * @returns {Promise<Array>} Array of {from_entity, to_entity, relationship_type} hops, or empty if no path
   */
  async getRelationshipPath(fromId, toId, options = {}) {
    const { maxDepth = 5 } = options;

    // Early return for same entity
    if (fromId === toId) {
      return [];
    }

    // BFS implementation using queue
    const queue = [{ entityId: fromId, path: [] }];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
      const { entityId, path } = queue.shift();

      // Check if we've reached max depth
      if (path.length >= maxDepth) {
        continue;
      }

      // Get direct relationships from current entity (both outgoing and incoming)
      const stmt = this.db.prepare(`
        SELECT
          r.from_entity_id,
          r.to_entity_id,
          r.relationship_type,
          r.weight,
          e_from.id AS from_id,
          e_from.type AS from_type,
          e_from.name AS from_name,
          e_to.id AS to_id,
          e_to.type AS to_type,
          e_to.name AS to_name
        FROM entity_relationships r
        JOIN entities e_from ON e_from.id = r.from_entity_id
        JOIN entities e_to ON e_to.id = r.to_entity_id
        WHERE r.from_entity_id = ? OR r.to_entity_id = ?
      `);
      const relationships = stmt.all(entityId, entityId);

      for (const rel of relationships) {
        // Follow the edge in the direction away from current entity
        const nextId = rel.from_entity_id === entityId ? rel.to_entity_id : rel.from_entity_id;

        // Found target - return path
        if (nextId === toId) {
          return [
            ...path,
            {
              from_entity: {
                id: rel.from_id,
                type: rel.from_type,
                name: rel.from_name,
              },
              to_entity: {
                id: rel.to_id,
                type: rel.to_type,
                name: rel.to_name,
              },
              relationship_type: rel.relationship_type,
              weight: rel.weight,
            },
          ];
        }

        // Add to queue if not visited
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({
            entityId: nextId,
            path: [
              ...path,
              {
                from_entity: {
                  id: rel.from_id,
                  type: rel.from_type,
                  name: rel.from_name,
                },
                to_entity: {
                  id: rel.to_id,
                  type: rel.to_type,
                  name: rel.to_name,
                },
                relationship_type: rel.relationship_type,
                weight: rel.weight,
              },
            ],
          });
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Get relationships for an entity (internal helper)
   * Includes both OUTGOING (from_entity_id = entityId) and INCOMING (to_entity_id = entityId)
   * @private
   */
  async _getEntityRelationships(entityId) {
    // Query both outgoing and incoming relationships
    const stmt = this.db.prepare(`
      SELECT
        r.relationship_type AS type,
        r.weight,
        e.id AS to_entity_id,
        e.type AS to_entity_type,
        e.name AS to_entity_name
      FROM entity_relationships r
      JOIN entities e ON e.id = r.to_entity_id
      WHERE r.from_entity_id = ?

      UNION

      SELECT
        r.relationship_type AS type,
        r.weight,
        e.id AS to_entity_id,
        e.type AS to_entity_type,
        e.name AS to_entity_name
      FROM entity_relationships r
      JOIN entities e ON e.id = r.from_entity_id
      WHERE r.to_entity_id = ?

      ORDER BY weight DESC
    `);
    const rows = stmt.all(entityId, entityId);

    // Format: {to_entity: {id, type, name}, type, weight}
    const relationships = rows.map(row => ({
      to_entity: {
        id: row.to_entity_id,
        type: row.to_entity_type,
        name: row.to_entity_name,
      },
      type: row.type,
      weight: row.weight,
    }));

    return relationships;
  }

  /**
   * Close database connection (if owned by this instance)
   */
  close() {
    if (this.ownDb && this.db) {
      this.db.close();
    }
  }
}

module.exports = {
  EntityQuery,
};
