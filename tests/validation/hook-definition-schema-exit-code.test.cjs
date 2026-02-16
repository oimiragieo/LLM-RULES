'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('hook-definition schema block exit code default is 2', () => {
  const schemaPath = path.join(process.cwd(), '.claude', 'schemas', 'hook-definition.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const blockDefault = schema?.properties?.exitCodes?.properties?.block?.default;
  assert.equal(blockDefault, 2);
});
