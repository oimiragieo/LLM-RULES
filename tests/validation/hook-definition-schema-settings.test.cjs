'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const schema = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '.claude', 'schemas', 'hook-definition.schema.json'), 'utf8')
);
const settings = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '.claude', 'settings.json'), 'utf8')
);

test('hook schema enum includes runtime hook types used by settings', () => {
  const enumValues = new Set(schema?.properties?.type?.enum || []);
  const hookTypes = Object.keys(settings?.hooks || {});

  const missing = hookTypes.filter(type => !enumValues.has(type));
  assert.deepEqual(missing, [], `schema enum missing hook types: ${missing.join(', ')}`);
});
