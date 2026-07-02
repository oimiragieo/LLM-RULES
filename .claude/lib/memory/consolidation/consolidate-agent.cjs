'use strict';

const crypto = require('node:crypto');

const TABLE_SQL = {
  episodic_memory: {
    pragma: 'PRAGMA table_info(episodic_memory)',
    addConsolidatedAt: 'ALTER TABLE episodic_memory ADD COLUMN consolidated_at INTEGER',
  },
  file_memory: {
    pragma: 'PRAGMA table_info(file_memory)',
    addConsolidatedAt: 'ALTER TABLE file_memory ADD COLUMN consolidated_at INTEGER',
  },
};

function ensureConsolidatedAtColumn(db, tableName) {
  const tableSql = TABLE_SQL[tableName];
  if (!tableSql) {
    throw new Error(`Unsupported consolidation table: ${tableName}`);
  }

  const columns = db.prepare(tableSql.pragma).all();
  const hasColumn = columns.some(column => column.name === 'consolidated_at');
  if (!hasColumn) {
    db.exec(tableSql.addConsolidatedAt);
  }
}

function collectPendingIds(db, sql) {
  try {
    return db
      .prepare(sql)
      .all()
      .map(row => row.id)
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

async function consolidate(db) {
  if (!db || typeof db.prepare !== 'function') {
    return { processed: 0, insightId: null };
  }

  ensureConsolidatedAtColumn(db, 'file_memory');
  ensureConsolidatedAtColumn(db, 'episodic_memory');

  const fileMemoryIds = collectPendingIds(
    db,
    'SELECT id FROM file_memory WHERE consolidated_at IS NULL'
  );
  const episodicIds = collectPendingIds(
    db,
    "SELECT id FROM episodic_memory WHERE consolidated_at IS NULL AND session_id != 'consolidation'"
  );
  const pendingIds = [...fileMemoryIds, ...episodicIds];

  if (pendingIds.length === 0) {
    return { processed: 0, insightId: null };
  }

  const now = Date.now();
  const insightId = crypto.randomUUID();
  const insightContent = `consolidated:${pendingIds.join(',')}`;

  const markFileMemory = db.prepare('UPDATE file_memory SET consolidated_at = ? WHERE id = ?');
  const markEpisodic = db.prepare('UPDATE episodic_memory SET consolidated_at = ? WHERE id = ?');
  const insertInsight = db.prepare(
    `INSERT INTO episodic_memory (id, session_id, content, importance_score, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    for (const id of fileMemoryIds) {
      markFileMemory.run(now, id);
    }

    for (const id of episodicIds) {
      markEpisodic.run(now, id);
    }

    insertInsight.run(insightId, 'consolidation', insightContent, 0.7, now);
  });

  transaction();

  return { processed: pendingIds.length, insightId };
}

module.exports = { consolidate };
