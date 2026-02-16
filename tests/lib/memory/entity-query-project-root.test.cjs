'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { EntityQuery } = require('../../../.claude/lib/memory/entity-query.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

test('EntityQuery resolves relative db paths from PROJECT_ROOT', () => {
  const relativeDbPath = '.claude/context/data/memory.db';
  const query = new EntityQuery(relativeDbPath);

  try {
    const pragma = query.db.prepare('PRAGMA database_list').all();
    const mainDb = pragma.find(row => row.name === 'main');
    assert.ok(mainDb && mainDb.file);
    const expected = path.resolve(PROJECT_ROOT, relativeDbPath);
    assert.equal(path.normalize(mainDb.file), path.normalize(expected));
  } finally {
    query.close();
  }
});
