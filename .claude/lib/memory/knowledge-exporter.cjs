// .claude/lib/memory/knowledge-exporter.cjs
// Exports project knowledge (entities, relationships, stats) to portable JSON format.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EntityQuery } = require('./entity-query.cjs');

/**
 * Compute the project hash: first 12 hex chars of MD5(projectDir).
 * @param {string} projectDir - Absolute path to the project directory.
 * @returns {string} 12-character hex hash.
 */
function getProjectHash(projectDir) {
  return crypto.createHash('md5').update(projectDir).digest('hex').slice(0, 12);
}

/**
 * Return the default export path for a project:
 *   ~/.claude/knowledge/<project-hash>/export.json
 * @param {string} projectDir - Absolute path to the project directory.
 * @returns {string} Absolute path to the default export file.
 */
function getDefaultOutputPath(projectDir) {
  const hash = getProjectHash(projectDir);
  return path.join(os.homedir(), '.claude', 'knowledge', hash, 'export.json');
}

/**
 * Resolve the SQLite entity database path for a given project directory.
 * Convention: {projectDir}/.claude/context/data/memory.db
 * @param {string} projectDir
 * @returns {string}
 */
function getEntityDbPath(projectDir) {
  return path.join(projectDir, '.claude', 'context', 'data', 'memory.db');
}

/**
 * Export knowledge from a project's SQLite entity database.
 *
 * Reads all entities and relationships, compiles stats, and returns a
 * portable JSON-serialisable object.  If the entity database does not
 * exist (or cannot be opened / validated), returns an empty export with
 * zero stats.
 *
 * @param {string} projectDir - Absolute path to the project directory.
 * @returns {Promise<{
 *   project: string,
 *   projectDir: string,
 *   entities: Array,
 *   relationships: Array,
 *   stats: { entityCountByType: Object, relationshipCountByType: Object },
 *   exportedAt: string
 * }>}
 */
async function exportKnowledge(projectDir) {
  const exportedAt = new Date().toISOString();
  const project = path.basename(projectDir);

  const emptyExport = {
    project,
    projectDir,
    entities: [],
    relationships: [],
    stats: {
      entityCountByType: {},
      relationshipCountByType: {},
    },
    exportedAt,
  };

  const dbPath = getEntityDbPath(projectDir);

  // No database → return empty export immediately.
  if (!fs.existsSync(dbPath)) {
    return emptyExport;
  }

  let query;
  try {
    query = new EntityQuery(dbPath);
  } catch (_err) {
    // Database exists but schema is invalid or cannot be opened.
    return emptyExport;
  }

  try {
    // Read all entities.
    const entities = query.db.prepare('SELECT * FROM entities ORDER BY created_at DESC').all();

    // Read all relationships.
    const relationships = query.db
      .prepare('SELECT * FROM entity_relationships ORDER BY id ASC')
      .all();

    // Compile entity count by type.
    const entityCountByType = {};
    for (const entity of entities) {
      entityCountByType[entity.type] = (entityCountByType[entity.type] || 0) + 1;
    }

    // Compile relationship count by type.
    const relationshipCountByType = {};
    for (const rel of relationships) {
      relationshipCountByType[rel.relationship_type] =
        (relationshipCountByType[rel.relationship_type] || 0) + 1;
    }

    return {
      project,
      projectDir,
      entities,
      relationships,
      stats: {
        entityCountByType,
        relationshipCountByType,
      },
      exportedAt,
    };
  } finally {
    query.close();
  }
}

/**
 * Export project knowledge to a JSON file.
 *
 * Writes atomically (temp file → rename) to prevent partial writes.
 * Creates all parent directories as needed.
 *
 * @param {string} projectDir - Absolute path to the project directory.
 * @param {string} [outputPath] - Destination file path.  Defaults to
 *   ~/.claude/knowledge/<project-hash>/export.json.
 * @returns {Promise<string>} Absolute path of the written file.
 */
async function exportToFile(projectDir, outputPath) {
  const destPath = outputPath || getDefaultOutputPath(projectDir);

  const exportData = await exportKnowledge(projectDir);

  // Ensure parent directory exists.
  const parentDir = path.dirname(destPath);
  fs.mkdirSync(parentDir, { recursive: true });

  // Atomic write: write to .tmp then rename.
  const tmpPath = destPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(exportData, null, 2), 'utf8');
  fs.renameSync(tmpPath, destPath);

  return destPath;
}

module.exports = {
  exportKnowledge,
  exportToFile,
  getProjectHash,
  getDefaultOutputPath,
};
