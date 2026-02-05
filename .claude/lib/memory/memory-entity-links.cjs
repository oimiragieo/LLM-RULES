'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { initializeDatabase } = require('../../tools/cli/init-memory-db.cjs');

const logger = createLogger('memory-entity-links');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureDb(projectRoot) {
  const root = projectRoot || PROJECT_ROOT;
  const dbPath = path.join(root, '.claude', 'data', 'memory.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return initializeDatabase(new DatabaseSync(dbPath));
}

function insertEntity(db, entity) {
  db.prepare(
    `
      INSERT OR IGNORE INTO entities (
        id,
        type,
        name,
        content,
        source_file
      )
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(entity.id, entity.type, entity.name, entity.content || null, entity.source_file || null);
}

function insertRelationship(db, fromId, toId, metadata) {
  const metaJson = metadata ? JSON.stringify(metadata) : null;
  db.prepare(
    `
      INSERT INTO entity_relationships (
        from_entity_id,
        to_entity_id,
        relationship_type,
        metadata
      )
      SELECT ?, ?, 'references', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM entity_relationships
        WHERE from_entity_id = ? AND to_entity_id = ? AND relationship_type = 'references'
      )
    `
  ).run(fromId, toId, metaJson, fromId, toId);
}

function linkMemoryToTools(memoryId, toolNames, projectRoot) {
  if (!memoryId || !Array.isArray(toolNames) || toolNames.length === 0) {
    return { linked: 0, skipped: 0 };
  }

  const db = ensureDb(projectRoot);
  let linked = 0;
  let skipped = 0;

  try {
    insertEntity(db, {
      id: memoryId,
      type: 'memory',
      name: memoryId,
      source_file: memoryId,
    });

    for (const toolName of toolNames) {
      if (!toolName) {
        skipped += 1;
        continue;
      }
      const slug = slugify(toolName);
      if (!slug) {
        skipped += 1;
        continue;
      }
      const skillId = `skill:${slug}`;
      insertEntity(db, {
        id: skillId,
        type: 'skill',
        name: String(toolName),
      });
      insertRelationship(db, memoryId, skillId, {
        source: 'memory_extraction',
      });
      insertRelationship(db, skillId, memoryId, {
        source: 'memory_extraction',
        direction: 'reverse',
      });
      linked += 1;
    }
  } catch (error) {
    logger.warn('Failed to link memory to tools', {
      error: error.message,
      memoryId,
    });
  } finally {
    db.close();
  }

  return { linked, skipped };
}

function getMemoriesForTool(toolName, projectRoot) {
  if (!toolName) {
    return [];
  }
  const slug = slugify(toolName);
  if (!slug) {
    return [];
  }

  const db = ensureDb(projectRoot);
  try {
    const skillId = `skill:${slug}`;
    const rows = db
      .prepare(
        `
          SELECT to_entity_id AS memory_id
          FROM entity_relationships
          WHERE from_entity_id = ? AND relationship_type = 'references'
        `
      )
      .all(skillId);
    return rows.map(row => row.memory_id).filter(Boolean);
  } finally {
    db.close();
  }
}

function cleanupOrphanedRelationships(projectRoot) {
  const db = ensureDb(projectRoot);
  try {
    const countRow = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM entity_relationships
        WHERE from_entity_id NOT IN (SELECT id FROM entities)
           OR to_entity_id NOT IN (SELECT id FROM entities)
      `
      )
      .get();
    const count = countRow?.count || 0;

    if (count > 0) {
      db.exec(
        `
        DELETE FROM entity_relationships
        WHERE from_entity_id NOT IN (SELECT id FROM entities)
           OR to_entity_id NOT IN (SELECT id FROM entities)
      `
      );
    }

    return { deleted: count };
  } catch (error) {
    logger.warn('Failed to cleanup orphaned relationships', { error: error.message });
    return { deleted: 0, error: error.message };
  } finally {
    db.close();
  }
}

module.exports = {
  linkMemoryToTools,
  getMemoriesForTool,
  cleanupOrphanedRelationships,
  slugify,
};
