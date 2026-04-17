'use strict';

function enforceRetention(db, now = Date.now()) {
  if (!db || typeof db.prepare !== 'function') {
    return { purgedFileMemory: 0 };
  }

  const deleteExpired = db.prepare(
    'DELETE FROM file_memory WHERE expires_at IS NOT NULL AND expires_at < ?'
  );
  const result = deleteExpired.run(now);

  return {
    purgedFileMemory: Number(result.changes || 0),
  };
}

module.exports = { enforceRetention };
